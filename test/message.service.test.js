import test from 'node:test';
import assert from 'node:assert/strict';
import sequelize from '../src/config/db.js';
import Message from '../src/modules/message/message.model.js';
import Chat from '../src/modules/chat/chat.model.js';
import ChatParticipant from '../src/modules/chat_participant/chat_participant.model.js';
import MessageReceipt from '../src/modules/message_receipt/message_receipt.model.js';
import MessageDeletion from '../src/modules/message_deletion/message_deletion.model.js';
import MessageReaction from '../src/modules/message_reaction/message_reaction.model.js';
import MessagePin from '../src/modules/message_pin/message_pin.model.js';
import OutboxEvent from '../src/modules/outbox/outbox_event.model.js';
import {
  sendMessage,
  sendMessageDeps,
  getChatMessages,
  markMessageRead,
  markAllRead,
} from '../src/modules/message/message.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeMsg = (overrides = {}) => {
  const base = {
    id: 1, chat_id: 10, sender_id: 5, message: 'Hello', message_type: 'text',
    created_at: new Date(), is_deleted: false, idempotency_key: null,
    ...overrides,
  };
  base.toJSON = () => ({ ...base });
  return base;
};

const makeOutbox = (msg, overrides = {}) => {
  const event = {
    id: 9001,
    event_type: 'message.created',
    aggregate_type: 'message',
    aggregate_id: msg.id,
    payload: { messageId: msg.id, chatId: msg.chat_id, senderId: msg.sender_id },
    status: 'pending',
    attempts: 0,
    save: async function save() { return this; },
    ...overrides,
  };
  return event;
};

/** Stub outbox create + post-commit BullMQ publish (no real Redis in unit tests). */
const stubOutbox = (t, msg) => {
  const event = makeOutbox(msg);
  t.mock.method(OutboxEvent, 'create', async () => {
    event.status = 'pending';
    return event;
  });
  t.mock.method(sendMessageDeps, 'publishOutboxEvent', async () => ({
    ok: true,
    jobId: `outbox-event-${event.id}`,
    duplicated: false,
  }));
  return event;
};

// Shared stubs for hydrateMessages (avoids N+1 mock chasing)
const stubHydration = (t) => {
  t.mock.method(MessageDeletion, 'findAll', async () => []);
  t.mock.method(MessagePin, 'findAll', async () => []);
  t.mock.method(MessageReaction, 'findAll', async () => []);
};

// ===========================================================================
// sendMessage — validation
// ===========================================================================
test('sendMessage requires chat_id', async () => {
  await assert.rejects(
    sendMessage({ sender_id: 5, message: 'test' }),
    /chat_id is required/
  );
});

test('sendMessage requires sender_id', async () => {
  await assert.rejects(
    sendMessage({ chat_id: 10, message: 'test' }),
    /sender_id is required/
  );
});

// ===========================================================================
// sendMessage — ACID transaction: message + chat update + unread increment
// ===========================================================================
test('sendMessage commits message insert, chat update, and unread increment atomically', async (t) => {
  const ops = [];
  const msg = makeMsg();
  const outbox = makeOutbox(msg);

  t.mock.method(Message, 'findOne', async () => null);  // no DB idempotency hit
  t.mock.method(sequelize, 'transaction', async (cb) => {
    t.mock.method(Message, 'create', async () => { ops.push('insert'); return msg; });
    t.mock.method(Chat, 'update', async () => { ops.push('chat_update'); return [1]; });
    t.mock.method(ChatParticipant, 'increment', async () => { ops.push('unread_inc'); return []; });
    t.mock.method(ChatParticipant, 'findAll', async () => []);
    t.mock.method(MessageReceipt, 'bulkCreate', async () => { ops.push('receipts'); return []; });
    t.mock.method(OutboxEvent, 'create', async () => { ops.push('outbox'); return outbox; });
    return cb({});
  });
  t.mock.method(Message, 'findByPk', async () => msg);
  t.mock.method(sendMessageDeps, 'publishOutboxEvent', async () => {
    ops.push('publish');
    return { ok: true, jobId: `outbox-event-${outbox.id}`, duplicated: false };
  });

  const result = await sendMessage({ chat_id: 10, sender_id: 5, message: 'Hello' });
  assert.ok(result.message);
  assert.equal(ops.includes('insert'),      true, 'message must be inserted');
  assert.equal(ops.includes('chat_update'), true, 'chat last_message must update');
  assert.equal(ops.includes('unread_inc'),  true, 'unread counts must increment');
  assert.equal(ops.includes('outbox'),      true, 'outbox event must be created in TX');
  assert.equal(ops.includes('publish'),     true, 'outbox must be published to BullMQ after commit');
});

// ===========================================================================
// Idempotency — DB-level (race fallback, no Redis mock needed)
// ===========================================================================
test('sendMessage returns idempotent=true when DB-level idempotency key match found', async (t) => {
  const existing = makeMsg({ id: 42, idempotency_key: 'KEY-X', message_type: 'text' });
  // First findOne returns the existing message (DB-level check in sendMessage)
  t.mock.method(Message, 'findOne', async (opts) => {
    if (opts?.where?.idempotency_key) return existing;
    return null;
  });

  const result = await sendMessage({
    chat_id: 10,
    sender_id: 5,
    message: 'Retry',
    idempotency_key: 'KEY-X',
  });

  assert.equal(result.idempotent, true);
  assert.equal(result.message.id, 42);
});

test('sendMessage processes two requests with different keys as two messages', async (t) => {
  const results = [];

  // Each call goes through different mocks to simulate two separate messages
  for (const key of ['KEY-A', 'KEY-B']) {
    const msg = makeMsg({ id: key === 'KEY-A' ? 1 : 2, idempotency_key: key, message_type: 'text' });
    t.mock.method(Message, 'findOne', async (opts) => {
      if (opts?.where?.idempotency_key) return null;  // no existing
      return null;
    });
    t.mock.method(sequelize, 'transaction', async (cb) => {
      t.mock.method(Message, 'create', async () => msg);
      t.mock.method(Chat, 'update', async () => [1]);
      t.mock.method(ChatParticipant, 'increment', async () => []);
      t.mock.method(ChatParticipant, 'findAll', async () => []);
      t.mock.method(MessageReceipt, 'bulkCreate', async () => []);
      stubOutbox(t, msg);
      return cb({});
    });
    t.mock.method(Message, 'findByPk', async () => msg);

    const r = await sendMessage({ chat_id: 10, sender_id: 5, message: 'Msg', idempotency_key: key });
    results.push(r.message.id);
  }

  const uniqueIds = new Set(results);
  assert.equal(uniqueIds.size, 2, 'Two different keys must produce two different messages');
});

// ===========================================================================
// getChatMessages — cursor pagination
// ===========================================================================
test('getChatMessages returns hasMore=true and nextCursor when more pages available', async (t) => {
  // 21 messages -> page of 20 -> hasMore=true
  const messages = Array.from({ length: 21 }, (_, i) => makeMsg({ id: 100 - i }));
  t.mock.method(Message, 'findAll', async () => messages);
  stubHydration(t);

  const result = await getChatMessages({ chatId: 10, requestingUserId: 5, limit: 20 });

  assert.equal(result.hasMore, true);
  assert.ok(result.nextCursor, 'nextCursor must be set when hasMore=true');
  assert.equal(result.messages.length, 20);
});

test('getChatMessages returns hasMore=false when fewer messages than limit', async (t) => {
  const messages = [makeMsg({ id: 50 }), makeMsg({ id: 49 })];
  t.mock.method(Message, 'findAll', async () => messages);
  stubHydration(t);

  const result = await getChatMessages({ chatId: 10, requestingUserId: 5, limit: 20 });

  assert.equal(result.hasMore, false);
  assert.equal(result.nextCursor, null);
  assert.equal(result.messages.length, 2);
});

test('getChatMessages returns empty array for a chat with no messages', async (t) => {
  t.mock.method(Message, 'findAll', async () => []);
  stubHydration(t);

  const result = await getChatMessages({ chatId: 10, requestingUserId: 5, limit: 20 });

  assert.equal(result.hasMore, false);
  assert.equal(result.nextCursor, null);
  assert.deepEqual(result.messages, []);
});

test('getChatMessages hides messages deleted for the requesting user', async (t) => {
  const messages = [makeMsg({ id: 10 }), makeMsg({ id: 11 }), makeMsg({ id: 12 })];
  t.mock.method(Message, 'findAll', async () => messages);
  t.mock.method(MessagePin, 'findAll', async () => []);
  t.mock.method(MessageReaction, 'findAll', async () => []);
  // message 11 is deleted for user 5
  t.mock.method(MessageDeletion, 'findAll', async () => [{ message_id: 11 }]);

  const result = await getChatMessages({ chatId: 10, requestingUserId: 5, limit: 20 });

  const ids = result.messages.map((m) => m.id);
  assert.ok(!ids.includes(11), 'deleted-for-me message must not appear');
  assert.equal(result.messages.length, 2);
});

test('getChatMessages reverses order so oldest messages come first in page', async (t) => {
  const messages = [makeMsg({ id: 50 }), makeMsg({ id: 49 }), makeMsg({ id: 48 })];
  t.mock.method(Message, 'findAll', async () => messages);
  stubHydration(t);

  const result = await getChatMessages({ chatId: 10, requestingUserId: 5, limit: 20 });

  // The service does .reverse() before returning
  const ids = result.messages.map((m) => m.id);
  assert.equal(ids[0], 48, 'oldest message (lowest id) must be first');
  assert.equal(ids[ids.length - 1], 50, 'newest message (highest id) must be last');
});

// ===========================================================================
// markMessageRead
// ===========================================================================
test('markMessageRead is a no-op for the original sender', async (t) => {
  const msg = makeMsg({ sender_id: 5 });
  t.mock.method(Message, 'findOne', async () => msg);

  const result = await markMessageRead({ messageId: 1, userId: 5 });
  assert.equal(result, msg, 'sender read must return the message without side effects');
});

test('markMessageRead updates receipt row for a valid recipient', async (t) => {
  const msg = makeMsg({ sender_id: 5 });
  const participant = { unread_count: 2, decrement: async () => {} };
  let receiptUpdated = false;

  t.mock.method(Message, 'findOne', async () => msg);
  t.mock.method(sequelize, 'transaction', async (cb) => {
    t.mock.method(MessageReceipt, 'update', async () => { receiptUpdated = true; return [1]; });
    t.mock.method(ChatParticipant, 'findOne', async () => participant);
    return cb({});
  });

  await markMessageRead({ messageId: 1, userId: 9 });
  assert.equal(receiptUpdated, true, 'MessageReceipt.update must be called for recipient');
});

test('markMessageRead throws when message is not found', async (t) => {
  t.mock.method(Message, 'findOne', async () => null);
  await assert.rejects(
    markMessageRead({ messageId: 999, userId: 9 }),
    /Message not found/
  );
});

// ===========================================================================
// markAllRead
// ===========================================================================
test('markAllRead resets unread count to zero', async (t) => {
  const participant = { unread_count: 5, update: async (v) => Object.assign(participant, v) };
  const latestMsg = { id: 99 };

  t.mock.method(ChatParticipant, 'findOne', async () => participant);
  t.mock.method(Message, 'findOne', async () => latestMsg);
  t.mock.method(sequelize, 'transaction', async (cb) => {
    t.mock.method(MessageReceipt, 'update', async () => [1]);
    return cb({});
  });

  await markAllRead({ chatId: 10, userId: 9 });
  assert.equal(participant.unread_count, 0);
  assert.equal(participant.last_read_message_id, 99);
});

test('markAllRead sets last_read_message_id to null when chat is empty', async (t) => {
  const participant = { unread_count: 0, update: async (v) => Object.assign(participant, v) };

  t.mock.method(ChatParticipant, 'findOne', async () => participant);
  t.mock.method(Message, 'findOne', async () => null);
  t.mock.method(sequelize, 'transaction', async (cb) => {
    t.mock.method(MessageReceipt, 'update', async () => [0]);
    return cb({});
  });

  await markAllRead({ chatId: 10, userId: 9 });
  assert.equal(participant.last_read_message_id, null);
});

test('markAllRead rejects when user is not a participant', async (t) => {
  t.mock.method(ChatParticipant, 'findOne', async () => null);
  await assert.rejects(
    markAllRead({ chatId: 99, userId: 1 }),
    /not a participant/
  );
});
