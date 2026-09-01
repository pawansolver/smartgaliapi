import test from 'node:test';
import assert from 'node:assert/strict';
import sequelize from '../src/config/db.js';
import Message from '../src/modules/message/message.model.js';
import MessagePin from '../src/modules/message_pin/message_pin.model.js';
import {
  deleteForEveryone,
  editMessage,
  sendMessage,
  setMessagePin,
} from '../src/modules/message/message.service.js';
import { up as upMessagePins } from '../scripts/migrations/003-message-pins.js';

test('reply target must exist in the same active chat', async (t) => {
  t.mock.method(sequelize, 'transaction', async (callback) => callback({}));
  t.mock.method(Message, 'findOne', async () => null);

  await assert.rejects(
    sendMessage({
      chat_id: 7,
      sender_id: 9,
      message: 'Reply',
      reply_to: 42,
    }),
    /active message in the same chat/,
  );
});

test('message edit rejects empty text and expired messages', async (t) => {
  const message = {
    sender_id: 9,
    message_type: 'text',
    message: 'Original',
    created_at: new Date(),
  };
  t.mock.method(Message, 'findOne', async () => message);

  await assert.rejects(
    editMessage({ messageId: 1, userId: 9, newText: '   ' }),
    /cannot be empty/,
  );

  message.created_at = new Date(Date.now() - 16 * 60 * 1000);
  await assert.rejects(
    editMessage({ messageId: 1, userId: 9, newText: 'Changed' }),
    /within 15 minutes/,
  );
});

test('unsend enforces its window using created_at', async (t) => {
  t.mock.method(Message, 'findOne', async () => ({
    sender_id: 9,
    created_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
  }));

  await assert.rejects(
    deleteForEveryone({ messageId: 1, userId: 9 }),
    /within 24 hour/,
  );
});

test('message pins are idempotent and scoped to the message chat', async (t) => {
  const pin = { created_at: new Date() };
  t.mock.method(Message, 'findOne', async () => ({
    id: 11,
    chat_id: 7,
    is_deleted: false,
  }));
  t.mock.method(MessagePin, 'count', async () => 0);
  t.mock.method(MessagePin, 'findOne', async () => null);
  t.mock.method(MessagePin, 'findOrCreate', async () => [pin, true]);

  const result = await setMessagePin({
    messageId: 11,
    userId: 9,
    isPinned: true,
  });

  assert.equal(result.chatId, 7);
  assert.equal(result.messageId, 11);
  assert.equal(result.is_pinned, true);
  assert.equal(result.pinned_by, 9);
});

test('message pin migration synchronizes its relational model', async () => {
  let synced = false;
  await upMessagePins({
    model: { sync: async () => { synced = true; } },
  });
  assert.equal(synced, true);
});
