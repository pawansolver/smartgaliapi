import test from 'node:test';
import assert from 'node:assert/strict';
import sequelize from '../src/config/db.js';
import Chat from '../src/modules/chat/chat.model.js';
import ChatParticipant from '../src/modules/chat_participant/chat_participant.model.js';
import {
  createGroupChat,
  muteChat,
  pinChat,
} from '../src/modules/chat/chat.service.js';

// ===========================================================================
// createGroupChat — validation
// ===========================================================================
test('createGroupChat rejects missing name', async () => {
  await assert.rejects(
    createGroupChat({ name: '', participantIds: [2], created_by: 1 }),
    /Group name is required/
  );
});

test('createGroupChat rejects null name', async () => {
  await assert.rejects(
    createGroupChat({ name: null, participantIds: [2], created_by: 1 }),
    /Group name is required/
  );
});

test('createGroupChat rejects empty participants', async () => {
  await assert.rejects(
    createGroupChat({ name: 'Test Group', participantIds: [], created_by: 1 }),
    /At least one participant is required/
  );
});

test('createGroupChat rejects null participants', async () => {
  await assert.rejects(
    createGroupChat({ name: 'Test Group', participantIds: null, created_by: 1 }),
    /At least one participant is required/
  );
});

test('createGroupChat creates group inside a transaction', async (t) => {
  const chat = { id: 10, chat_type: 'group', name: 'Testers' };
  t.mock.method(sequelize, 'transaction', async (cb) => {
    t.mock.method(Chat, 'create', async () => chat);
    t.mock.method(ChatParticipant, 'bulkCreate', async (rows) => rows);
    return await cb({});
  });

  const result = await createGroupChat({
    name: 'Testers',
    participantIds: [2, 3],
    created_by: 1,
  });
  assert.equal(result.id, 10);
  assert.equal(result.chat_type, 'group');
});

test('createGroupChat deduplicates participants including creator', async (t) => {
  let bulkRows = [];
  const chat = { id: 11, chat_type: 'group', name: 'Dedupe Test' };
  t.mock.method(sequelize, 'transaction', async (cb) => {
    t.mock.method(Chat, 'create', async () => chat);
    t.mock.method(ChatParticipant, 'bulkCreate', async (rows) => { bulkRows = rows; return rows; });
    return await cb({});
  });

  await createGroupChat({
    name: 'Dedupe Test',
    participantIds: [1, 2, 2],
    created_by: 1,
  });
  const ids = bulkRows.map((r) => r.user_id);
  assert.equal(ids.length, new Set(ids).size, 'Participant IDs must be unique');
});

test('createGroupChat assigns admin role to creator', async (t) => {
  let bulkRows = [];
  const chat = { id: 12, chat_type: 'group', name: 'Admin Test' };
  t.mock.method(sequelize, 'transaction', async (cb) => {
    t.mock.method(Chat, 'create', async () => chat);
    t.mock.method(ChatParticipant, 'bulkCreate', async (rows) => { bulkRows = rows; return rows; });
    return await cb({});
  });

  await createGroupChat({
    name: 'Admin Test',
    participantIds: [2, 3],
    created_by: 1,
  });
  const creatorRow = bulkRows.find((r) => r.user_id === 1);
  const memberRow  = bulkRows.find((r) => r.user_id === 2);
  assert.equal(creatorRow?.role, 'admin');
  assert.equal(memberRow?.role, 'member');
});

// ===========================================================================
// muteChat
// ===========================================================================
test('muteChat mutes a participant notifications', async (t) => {
  const updated = {};
  const participant = {
    update: async (values) => { Object.assign(updated, values); return updated; },
  };
  t.mock.method(ChatParticipant, 'findOne', async () => participant);

  await muteChat({ chatId: 1, userId: 2, is_muted: true, muted_until: null });
  assert.equal(updated.is_muted, true);
  assert.equal(updated.muted_until, null);
});

test('muteChat unmutes with is_muted=false', async (t) => {
  const updated = {};
  const participant = {
    update: async (values) => { Object.assign(updated, values); return updated; },
  };
  t.mock.method(ChatParticipant, 'findOne', async () => participant);

  await muteChat({ chatId: 1, userId: 2, is_muted: false });
  assert.equal(updated.is_muted, false);
});

test('muteChat rejects if user is not a participant', async (t) => {
  t.mock.method(ChatParticipant, 'findOne', async () => null);
  await assert.rejects(
    muteChat({ chatId: 99, userId: 1, is_muted: true }),
    /not a participant/
  );
});

// ===========================================================================
// pinChat
// ===========================================================================
test('pinChat pins the chat for the user', async (t) => {
  const updated = {};
  const participant = {
    update: async (values) => { Object.assign(updated, values); return updated; },
  };
  t.mock.method(ChatParticipant, 'findOne', async () => participant);

  await pinChat({ chatId: 1, userId: 2, is_pinned: true });
  assert.equal(updated.is_pinned, true);
});

test('pinChat unpins the chat for the user', async (t) => {
  const updated = {};
  const participant = {
    update: async (values) => { Object.assign(updated, values); return updated; },
  };
  t.mock.method(ChatParticipant, 'findOne', async () => participant);

  await pinChat({ chatId: 1, userId: 2, is_pinned: false });
  assert.equal(updated.is_pinned, false);
});

test('pinChat rejects if user is not a participant', async (t) => {
  t.mock.method(ChatParticipant, 'findOne', async () => null);
  await assert.rejects(
    pinChat({ chatId: 99, userId: 1, is_pinned: true }),
    /not a participant/
  );
});
