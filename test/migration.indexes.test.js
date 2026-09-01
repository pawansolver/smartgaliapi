import test from 'node:test';
import assert from 'node:assert/strict';
import { up as upChatIndexes } from '../scripts/migrations/005-chat-indexes.js';

// ===========================================================================
// Migration 005 — chat indexes (idempotent, mock DB)
// ===========================================================================
test('005-chat-indexes up adds all 7 indexes when starting from blank', async () => {
  const addedIndexes = [];
  const existingIndexes = {};  // tracks what was added so re-runs skip
  const queryInterface = {
    showIndex: async (table) => existingIndexes[table] || [],
    addIndex:  async (table, fields, opts) => {
      addedIndexes.push(opts.name);
      if (!existingIndexes[table]) existingIndexes[table] = [];
      existingIndexes[table].push({ name: opts.name, unique: !!opts.unique });
    },
  };

  await upChatIndexes({ queryInterface });
  assert.equal(addedIndexes.length, 7, 'exactly 7 indexes must be created');
  assert.ok(addedIndexes.includes('uq_chat_participant_chat_user'));
  assert.ok(addedIndexes.includes('ix_chat_participants_user_id_is_deleted'));
  assert.ok(addedIndexes.includes('ix_chat_participants_chat_id_is_deleted'));
  assert.ok(addedIndexes.includes('ix_messages_chat_id_deleted_id'));
  assert.ok(addedIndexes.includes('ix_messages_chat_id_type_deleted'));
  assert.ok(addedIndexes.includes('ix_chats_deleted_last_message_at'));
  assert.ok(addedIndexes.includes('ix_message_receipts_user_id_read_at'));
});

test('005-chat-indexes up is idempotent (skips already-existing indexes)', async () => {
  const addedIndexes = [];
  const alreadyThere = [
    'uq_chat_participant_chat_user',
    'ix_chat_participants_user_id_is_deleted',
    'ix_chat_participants_chat_id_is_deleted',
    'ix_messages_chat_id_deleted_id',
    'ix_messages_chat_id_type_deleted',
    'ix_chats_deleted_last_message_at',
    'ix_message_receipts_user_id_read_at',
  ];
  const queryInterface = {
    showIndex: async (table) =>
      alreadyThere.map((name) => ({ name })),
    addIndex: async (_table, _fields, opts) => {
      addedIndexes.push(opts.name);
    },
  };

  await upChatIndexes({ queryInterface });
  assert.equal(addedIndexes.length, 0, 'no indexes must be created when all already exist');
});

test('005-chat-indexes uq_chat_participant_chat_user is marked UNIQUE', async () => {
  const addedOptions = {};
  const queryInterface = {
    showIndex: async () => [],
    addIndex: async (_table, _fields, opts) => {
      addedOptions[opts.name] = opts;
    },
  };
  await upChatIndexes({ queryInterface });
  assert.equal(
    addedOptions['uq_chat_participant_chat_user']?.unique,
    true,
    'chat_participant UNIQUE index must use unique:true option'
  );
});

test('005-chat-indexes ix_messages_chat_id_deleted_id covers cursor pagination columns', async () => {
  const addedCols = {};
  const queryInterface = {
    showIndex: async () => [],
    addIndex: async (table, fields, opts) => {
      addedCols[opts.name] = fields;
    },
  };
  await upChatIndexes({ queryInterface });
  const fields = addedCols['ix_messages_chat_id_deleted_id'];
  assert.ok(fields.includes('chat_id'),    'must cover chat_id');
  assert.ok(fields.includes('is_deleted'), 'must cover is_deleted');
  assert.ok(fields.includes('id'),         'must cover id for cursor');
});
