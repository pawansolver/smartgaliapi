import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiptsForMessage, getReceiptSummary } from '../src/modules/message_receipt/message_receipt.service.js';
import ChatParticipant from '../src/modules/chat_participant/chat_participant.model.js';
import MessageReceipt from '../src/modules/message_receipt/message_receipt.model.js';

// ===========================================================================
// createReceiptsForMessage
// ===========================================================================
test('createReceiptsForMessage creates one receipt per non-sender participant', async (t) => {
  const participants = [
    { user_id: 2 },
    { user_id: 3 },
  ];
  let bulkPayload = [];
  t.mock.method(ChatParticipant, 'findAll', async () => participants);
  t.mock.method(MessageReceipt, 'bulkCreate', async (rows) => { bulkPayload = rows; return rows; });

  await createReceiptsForMessage({ messageId: 100, chatId: 10, senderId: 1, transaction: {} });

  assert.equal(bulkPayload.length, 2);
  assert.ok(bulkPayload.every((r) => r.read_at === null));
  assert.ok(bulkPayload.every((r) => r.delivered_at === null));
  const userIds = bulkPayload.map((r) => r.user_id);
  assert.ok(!userIds.includes(1), 'sender must not get their own receipt');
});

test('createReceiptsForMessage is a no-op when no other participants', async (t) => {
  let bulkCalled = false;
  t.mock.method(ChatParticipant, 'findAll', async () => []);
  t.mock.method(MessageReceipt, 'bulkCreate', async () => { bulkCalled = true; });

  await createReceiptsForMessage({ messageId: 100, chatId: 10, senderId: 1, transaction: {} });
  assert.equal(bulkCalled, false);
});

// ===========================================================================
// getReceiptSummary
// ===========================================================================
test('getReceiptSummary counts delivered, read, and pending correctly', async (t) => {
  const receipts = [
    { delivered_at: new Date(), read_at: new Date() },   // read
    { delivered_at: new Date(), read_at: null  },         // delivered only
    { delivered_at: null,       read_at: null  },         // pending
  ];
  t.mock.method(MessageReceipt, 'findAll', async () => receipts);

  const summary = await getReceiptSummary(1);
  assert.equal(summary.total,     3);
  assert.equal(summary.read,      1);
  assert.equal(summary.delivered, 2);
  assert.equal(summary.pending,   1);
});

test('getReceiptSummary returns zeros for unreacted message', async (t) => {
  t.mock.method(MessageReceipt, 'findAll', async () => []);
  const summary = await getReceiptSummary(99);
  assert.equal(summary.total,     0);
  assert.equal(summary.read,      0);
  assert.equal(summary.delivered, 0);
  assert.equal(summary.pending,   0);
});
