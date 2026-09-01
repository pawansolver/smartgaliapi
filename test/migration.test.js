import test from 'node:test';
import assert from 'node:assert/strict';
import { down, up } from '../scripts/migrations/001-profile-module.js';
import {
  up as upChat,
} from '../scripts/migrations/002-chat-media-module.js';
import {
  down as downAuth,
  up as upAuth,
} from '../scripts/migrations/004-auth-redesign.js';

test('profile migration up can be validated with a mock query interface', async () => {
  const descriptions = {
    users: {},
    user_profiles: { bio: { existing: true } },
  };
  const added = [];
  const synced = [];
  const queryInterface = {
    describeTable: async (table) => descriptions[table],
    addColumn: async (table, column, definition) => {
      added.push({ table, column, definition });
      descriptions[table][column] = definition;
    },
  };
  const models = [
    { sync: async () => synced.push('addresses') },
    { sync: async () => synced.push('preferences') },
  ];

  await up({ queryInterface, models });
  assert.deepEqual(
    added.map(({ table, column }) => `${table}.${column}`),
    ['users.password', 'user_profiles.avatarUrl', 'user_profiles.locationName'],
  );
  assert.deepEqual(synced, ['addresses', 'preferences']);
});

test('profile migration down reverses models and removes only present columns', async () => {
  const dropped = [];
  const removed = [];
  const queryInterface = {
    showAllTables: async () => ['first', { tableName: 'second' }],
    dropTable: async (table) => dropped.push(table),
    describeTable: async (table) =>
      table === 'users'
        ? { password: {} }
        : { bio: {}, avatarUrl: {}, locationName: {} },
    removeColumn: async (table, column) => removed.push(`${table}.${column}`),
  };
  const models = [
    { getTableName: () => 'first' },
    { getTableName: () => 'second' },
  ];

  await down({ queryInterface, models });
  assert.deepEqual(dropped, ['second', 'first']);
  assert.deepEqual(removed, [
    'user_profiles.locationName',
    'user_profiles.avatarUrl',
    'user_profiles.bio',
    'users.password',
  ]);
});

test('chat migration adds only missing columns and indexes safely', async () => {
  const descriptions = {
    chats: { name: {} },
    chat_participants: {},
    messages: { message_type: {} },
  };
  const addedColumns = [];
  const addedIndexes = [];
  const synced = [];
  const indexes = {
    messages: [
      {
        name: 'existing_chat_index',
        fields: [{ attribute: 'chat_id' }, { attribute: 'id' }],
        unique: false,
      },
    ],
  };
  const queryInterface = {
    describeTable: async (table) => descriptions[table],
    addColumn: async (table, column, definition) => {
      addedColumns.push(`${table}.${column}`);
      descriptions[table][column] = definition;
    },
    showIndex: async (table) => indexes[table] || [],
    addIndex: async (table, fields, options) => {
      addedIndexes.push({ table, fields, options });
      indexes[table] ??= [];
      indexes[table].push({
        name: options.name,
        fields: fields.map((attribute) => ({ attribute })),
        unique: options.unique === true,
      });
    },
  };
  const models = [
    { sync: async () => synced.push('receipts') },
    { sync: async () => synced.push('reactions') },
  ];

  await upChat({ queryInterface, models });

  assert.equal(addedColumns.includes('chats.name'), false);
  assert.equal(addedColumns.includes('messages.message_type'), false);
  assert.equal(addedColumns.includes('messages.idempotency_key'), true);
  assert.equal(
    addedIndexes.some(({ options }) => options.name === 'ix_messages_chat_id_id'),
    false,
  );
  assert.deepEqual(synced, ['receipts', 'reactions']);
});

test('auth migration is idempotent and uses structured models', async () => {
  const users = {};
  const added = [];
  const synced = [];
  const queryInterface = {
    describeTable: async () => users,
    addColumn: async (table, column) => {
      added.push(`${table}.${column}`);
      users[column] = {};
    },
  };
  const models = [
    { sync: async () => synced.push('pending_signups') },
    { sync: async () => synced.push('email_otps') },
    { sync: async () => synced.push('refresh_tokens') },
  ];
  await upAuth({ queryInterface, models });
  await upAuth({ queryInterface, models: [] });
  assert.deepEqual(added, ['users.last_login']);
  assert.deepEqual(synced, ['pending_signups', 'email_otps', 'refresh_tokens']);
});

test('auth migration down reverses tables and removes last_login when present', async () => {
  const dropped = [];
  const removed = [];
  const queryInterface = {
    showAllTables: async () => ['pending_signups', 'email_otps', 'refresh_tokens'],
    dropTable: async (table) => dropped.push(table),
    describeTable: async () => ({ last_login: {} }),
    removeColumn: async (table, column) => removed.push(`${table}.${column}`),
  };
  const models = [
    { getTableName: () => 'pending_signups' },
    { getTableName: () => 'email_otps' },
    { getTableName: () => 'refresh_tokens' },
  ];
  await downAuth({ queryInterface, models });
  assert.deepEqual(dropped, ['refresh_tokens', 'email_otps', 'pending_signups']);
  assert.deepEqual(removed, ['users.last_login']);
});
