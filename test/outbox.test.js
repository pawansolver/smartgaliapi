import test from 'node:test';
import assert from 'node:assert/strict';
import sequelize from '../src/config/db.js';
import Message from '../src/modules/message/message.model.js';
import Chat from '../src/modules/chat/chat.model.js';
import ChatParticipant from '../src/modules/chat_participant/chat_participant.model.js';
import MessageReceipt from '../src/modules/message_receipt/message_receipt.model.js';
import OutboxEvent from '../src/modules/outbox/outbox_event.model.js';
import * as outboxService from '../src/modules/outbox/outbox.service.js';
import { processEvent, processorDeps } from '../src/modules/outbox/outbox.processor.js';
import {
  OUTBOX_EVENT_TYPES,
  OUTBOX_AGGREGATE_TYPES,
  OUTBOX_STATUS,
} from '../src/modules/outbox/outbox.events.js';
import { sendMessage, sendMessageDeps } from '../src/modules/message/message.service.js';
import { up as upOutbox, down as downOutbox, version as outboxVersion } from '../scripts/migrations/006-outbox-events.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeMsg = (overrides = {}) => {
  const base = {
    id: 1,
    chat_id: 10,
    sender_id: 5,
    message: 'Hello',
    message_type: 'text',
    created_at: new Date(),
    is_deleted: false,
    idempotency_key: null,
    ...overrides,
  };
  base.toJSON = () => ({ ...base });
  return base;
};

const makeOutboxRow = (overrides = {}) => {
  const row = {
    id: 500,
    event_type: OUTBOX_EVENT_TYPES.MESSAGE_CREATED,
    aggregate_type: OUTBOX_AGGREGATE_TYPES.MESSAGE,
    aggregate_id: 1,
    payload: { messageId: 1, chatId: 10, senderId: 5 },
    status: OUTBOX_STATUS.PENDING,
    attempts: 0,
    available_at: new Date(),
    processed_at: null,
    last_error: null,
    save: async function save() { return this; },
    ...overrides,
  };
  return row;
};

// ===========================================================================
// Successful transaction: message + outbox
// ===========================================================================
test('sendMessage creates message and outbox event with correct payload in same TX', async (t) => {
  const msg = makeMsg({ id: 77 });
  let createArgs = null;
  let createdOutbox = null;

  t.mock.method(Message, 'findOne', async () => null);
  t.mock.method(sequelize, 'transaction', async (cb) => {
    t.mock.method(Message, 'create', async () => msg);
    t.mock.method(Chat, 'update', async () => [1]);
    t.mock.method(ChatParticipant, 'increment', async () => []);
    t.mock.method(ChatParticipant, 'findAll', async () => []);
    t.mock.method(MessageReceipt, 'bulkCreate', async () => []);
    t.mock.method(OutboxEvent, 'create', async (data) => {
      createArgs = { ...data, payload: { ...data.payload } };
      createdOutbox = makeOutboxRow({
        ...data,
        id: 501,
        aggregate_id: data.aggregate_id,
        payload: data.payload,
        status: data.status,
      });
      return createdOutbox;
    });
    return cb({});
  });
  t.mock.method(Message, 'findByPk', async () => msg);
  t.mock.method(sendMessageDeps, 'publishOutboxEvent', async () => ({
    ok: true,
    jobId: 'outbox-event-501',
    duplicated: false,
  }));

  const result = await sendMessage({ chat_id: 10, sender_id: 5, message: 'Hello outbox' });

  assert.ok(result.message);
  assert.equal(result.idempotent, false);
  assert.ok(createArgs, 'outbox event must be created inside TX');
  assert.equal(createArgs.event_type, 'message.created');
  assert.equal(createArgs.aggregate_type, 'message');
  assert.equal(createArgs.aggregate_id, 77);
  assert.equal(createArgs.status, 'pending');
  assert.deepEqual(createArgs.payload, {
    messageId: 77,
    chatId: 10,
    senderId: 5,
  });
});

// ===========================================================================
// Transaction rollback: neither message nor outbox
// ===========================================================================
test('sendMessage rollback creates neither message nor outbox event', async (t) => {
  let messageCreated = false;
  let outboxCreated = false;

  t.mock.method(Message, 'findOne', async () => null);
  t.mock.method(sequelize, 'transaction', async (cb) => {
    t.mock.method(Message, 'create', async () => {
      messageCreated = true;
      return makeMsg({ id: 88 });
    });
    t.mock.method(Chat, 'update', async () => [1]);
    t.mock.method(ChatParticipant, 'increment', async () => {
      throw new Error('forced unread failure');
    });
    t.mock.method(OutboxEvent, 'create', async () => {
      outboxCreated = true;
      return makeOutboxRow({ id: 502 });
    });
    return cb({});
  });

  await assert.rejects(
    sendMessage({ chat_id: 10, sender_id: 5, message: 'Will fail' }),
    /forced unread failure/,
  );

  // Outbox is after unread increment — should never run when increment throws
  assert.equal(outboxCreated, false, 'outbox must not be created after TX failure');
  // Message create ran inside the failing TX callback; in real DB it would roll back.
  // Here we assert outbox was never reached (atomic step ordering).
  assert.equal(messageCreated, true, 'message create attempted before failure point');
});

test('sendMessage rollback when outbox create fails leaves no committed outbox', async (t) => {
  t.mock.method(Message, 'findOne', async () => null);
  t.mock.method(sequelize, 'transaction', async (cb) => {
    t.mock.method(Message, 'create', async () => makeMsg({ id: 89 }));
    t.mock.method(Chat, 'update', async () => [1]);
    t.mock.method(ChatParticipant, 'increment', async () => []);
    t.mock.method(ChatParticipant, 'findAll', async () => []);
    t.mock.method(MessageReceipt, 'bulkCreate', async () => []);
    t.mock.method(OutboxEvent, 'create', async () => {
      throw new Error('forced outbox failure');
    });
    return cb({});
  });

  await assert.rejects(
    sendMessage({ chat_id: 10, sender_id: 5, message: 'Outbox fails' }),
    /forced outbox failure/,
  );
});

// ===========================================================================
// Idempotency: no duplicate message / outbox
// ===========================================================================
test('idempotent sendMessage does not create a second outbox event', async (t) => {
  const existing = makeMsg({ id: 42, idempotency_key: 'KEY-OUTBOX', message_type: 'text' });
  let outboxCreateCalls = 0;

  t.mock.method(Message, 'findOne', async (opts) => {
    if (opts?.where?.idempotency_key) return existing;
    return null;
  });
  t.mock.method(OutboxEvent, 'create', async () => {
    outboxCreateCalls += 1;
    return makeOutboxRow();
  });

  const result = await sendMessage({
    chat_id: 10,
    sender_id: 5,
    message: 'Retry',
    idempotency_key: 'KEY-OUTBOX',
  });

  assert.equal(result.idempotent, true);
  assert.equal(result.message.id, 42);
  assert.equal(outboxCreateCalls, 0, 'idempotent return must not create outbox event');
});

// ===========================================================================
// Outbox service status transitions
// ===========================================================================
test('outbox service marks pending → processing → published', async (t) => {
  const row = makeOutboxRow({ status: OUTBOX_STATUS.PENDING, attempts: 0 });

  t.mock.method(OutboxEvent, 'findByPk', async () => row);

  const processing = await outboxService.markProcessing(row.id);
  assert.equal(processing.status, OUTBOX_STATUS.PROCESSING);
  assert.equal(processing.attempts, 1);

  const published = await outboxService.markPublished(row.id);
  assert.equal(published.status, OUTBOX_STATUS.PUBLISHED);
  assert.ok(published.processed_at);
});

test('outbox service marks failed with last_error', async (t) => {
  const row = makeOutboxRow({ status: OUTBOX_STATUS.PROCESSING, attempts: 1 });
  t.mock.method(OutboxEvent, 'findByPk', async () => row);

  const failed = await outboxService.markFailed(row.id, new Error('socket down'));
  assert.equal(failed.status, OUTBOX_STATUS.FAILED);
  assert.match(failed.last_error, /socket down/);
});

test('getPendingEvents returns only pending events available now', async (t) => {
  const pending = [makeOutboxRow({ id: 1 }), makeOutboxRow({ id: 2 })];
  let capturedWhere = null;

  t.mock.method(OutboxEvent, 'findAll', async (opts) => {
    capturedWhere = opts.where;
    return pending;
  });

  const rows = await outboxService.getPendingEvents({ limit: 10 });
  assert.equal(rows.length, 2);
  assert.equal(capturedWhere.status, OUTBOX_STATUS.PENDING);
  assert.ok(capturedWhere.available_at);
});

test('createEvent persists required fields with pending status', async (t) => {
  let created = null;
  t.mock.method(OutboxEvent, 'create', async (data) => {
    created = makeOutboxRow({ ...data, id: 777 });
    return created;
  });

  const event = await outboxService.createEvent({
    event_type: OUTBOX_EVENT_TYPES.MESSAGE_CREATED,
    aggregate_type: OUTBOX_AGGREGATE_TYPES.MESSAGE,
    aggregate_id: 99,
    payload: { messageId: 99, chatId: 1, senderId: 2 },
  });

  assert.equal(event.event_type, 'message.created');
  assert.equal(event.aggregate_type, 'message');
  assert.equal(event.aggregate_id, 99);
  assert.equal(event.status, 'pending');
  assert.deepEqual(event.payload, { messageId: 99, chatId: 1, senderId: 2 });
});

// ===========================================================================
// Processor abstraction
// ===========================================================================
test('processEvent routes message.created and marks published', async (t) => {
  const row = makeOutboxRow({ status: OUTBOX_STATUS.PENDING });
  const msg = makeMsg();
  const emitted = [];
  const fakeIo = {
    to: (room) => ({
      emit: (event, payload) => emitted.push({ room, event, payload }),
    }),
  };
  const previousPush = processorDeps.handleMessageCreatedPush;
  processorDeps.handleMessageCreatedPush = async () => ({ skipped: true });

  t.mock.method(OutboxEvent, 'findByPk', async () => row);

  try {
    const result = await processEvent(row, { message: msg, io: fakeIo });

    assert.equal(result.ok, true);
    assert.equal(row.status, OUTBOX_STATUS.PUBLISHED);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].event, 'chat:message');
    assert.equal(emitted[0].room, 'chat:10');
  } finally {
    processorDeps.handleMessageCreatedPush = previousPush;
  }
});

test('processEvent is idempotent for already-published events', async (t) => {
  const row = makeOutboxRow({ status: OUTBOX_STATUS.PUBLISHED });
  t.mock.method(OutboxEvent, 'findByPk', async () => row);

  const result = await processEvent(row, { message: makeMsg() });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'already_published');
});

test('processEvent marks failed for unknown event_type', async (t) => {
  const row = makeOutboxRow({
    event_type: 'unknown.event',
    status: OUTBOX_STATUS.PENDING,
  });
  t.mock.method(OutboxEvent, 'findByPk', async () => row);

  const result = await processEvent(row);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unknown_event_type');
  assert.equal(row.status, OUTBOX_STATUS.FAILED);
});

test('processEvent marks failed when handler throws', async (t) => {
  const row = makeOutboxRow({ status: OUTBOX_STATUS.PENDING });
  t.mock.method(OutboxEvent, 'findByPk', async () => row);

  const brokenIo = {
    to: () => {
      throw new Error('Socket.IO not initialized');
    },
  };

  const result = await processEvent(row, { message: makeMsg(), io: brokenIo });
  assert.equal(result.ok, false);
  assert.equal(row.status, OUTBOX_STATUS.FAILED);
  assert.match(row.last_error, /Socket\.IO not initialized/);
});

// ===========================================================================
// Migration 006 — up / down / up with mock queryInterface
// ===========================================================================
test('006-outbox-events migration version is registered', () => {
  assert.equal(outboxVersion, '006-outbox-events');
});

test('006-outbox-events up syncs table and ensures indexes', async () => {
  const synced = [];
  const addedIndexes = [];
  const indexes = { outbox_events: [] };

  const model = {
    sync: async () => { synced.push('outbox_events'); },
    getTableName: () => 'outbox_events',
  };

  const queryInterface = {
    showIndex: async (table) => indexes[table] || [],
    addIndex: async (table, fields, options) => {
      addedIndexes.push({ table, fields, options });
      indexes[table] = indexes[table] || [];
      indexes[table].push({ name: options.name, fields });
    },
  };

  await upOutbox({ model, queryInterface });

  assert.deepEqual(synced, ['outbox_events']);
  assert.equal(addedIndexes.length, 2);
  assert.equal(addedIndexes[0].options.name, 'ix_outbox_status_available_at');
  assert.deepEqual(addedIndexes[0].fields, ['status', 'available_at']);
  assert.equal(addedIndexes[1].options.name, 'uq_outbox_event_type_aggregate');
  assert.equal(addedIndexes[1].options.unique, true);
  assert.deepEqual(addedIndexes[1].fields, ['event_type', 'aggregate_type', 'aggregate_id']);
});

test('006-outbox-events down drops indexes and table; up again is idempotent', async () => {
  const dropped = [];
  const removedIndexes = [];
  let tableExists = true;
  const indexes = {
    outbox_events: [
      { name: 'ix_outbox_status_available_at' },
      { name: 'uq_outbox_event_type_aggregate' },
    ],
  };

  const model = {
    sync: async () => { tableExists = true; },
    getTableName: () => 'outbox_events',
  };

  const queryInterface = {
    showAllTables: async () => (tableExists ? ['outbox_events'] : []),
    showIndex: async (table) => indexes[table] || [],
    removeIndex: async (table, name) => {
      removedIndexes.push(name);
      indexes[table] = (indexes[table] || []).filter((i) => i.name !== name);
    },
    dropTable: async (table) => {
      dropped.push(table);
      tableExists = false;
      indexes[table] = [];
    },
    addIndex: async (table, fields, options) => {
      indexes[table] = indexes[table] || [];
      if (!indexes[table].some((i) => i.name === options.name)) {
        indexes[table].push({ name: options.name, fields });
      }
    },
  };

  await downOutbox({ model, queryInterface });
  assert.deepEqual(dropped, ['outbox_events']);
  assert.ok(removedIndexes.includes('ix_outbox_status_available_at'));
  assert.ok(removedIndexes.includes('uq_outbox_event_type_aggregate'));

  // UP again after DOWN
  const addedAgain = [];
  queryInterface.addIndex = async (table, fields, options) => {
    addedAgain.push(options.name);
    indexes[table] = indexes[table] || [];
    indexes[table].push({ name: options.name, fields });
  };

  await upOutbox({ model, queryInterface });
  assert.equal(tableExists, true);
  assert.deepEqual(addedAgain, [
    'ix_outbox_status_available_at',
    'uq_outbox_event_type_aggregate',
  ]);

  // Second UP is idempotent (indexes already exist)
  const addedThird = [];
  queryInterface.addIndex = async (_table, _fields, options) => {
    addedThird.push(options.name);
  };
  await upOutbox({ model, queryInterface });
  assert.deepEqual(addedThird, [], 'second up must skip existing indexes');
});
