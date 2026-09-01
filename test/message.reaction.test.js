import test from 'node:test';
import assert from 'node:assert/strict';
import MessageReaction from '../src/modules/message_reaction/message_reaction.model.js';
import { toggleReaction, getReactionSummary, bulkLoadReactions } from '../src/modules/message_reaction/message_reaction.service.js';

// ===========================================================================
// toggleReaction — add and remove
// ===========================================================================
test('toggleReaction adds a reaction when none exists', async (t) => {
  t.mock.method(MessageReaction, 'findOne', async () => null);
  t.mock.method(MessageReaction, 'create', async () => {});
  t.mock.method(MessageReaction, 'findAll', async () => [
    { emoji: 'THUMBS_UP', user_id: 5 },
  ]);

  const result = await toggleReaction({ messageId: 1, userId: 5, emoji: 'THUMBS_UP' });
  assert.equal(result.action, 'added');
  assert.equal(result.emoji, 'THUMBS_UP');
  assert.equal(result.summary['THUMBS_UP'].count, 1);
});

test('toggleReaction removes an existing reaction (toggle off)', async (t) => {
  let destroyed = false;
  const existing = { destroy: async () => { destroyed = true; } };
  t.mock.method(MessageReaction, 'findOne', async () => existing);
  t.mock.method(MessageReaction, 'findAll', async () => []);

  const result = await toggleReaction({ messageId: 1, userId: 5, emoji: 'THUMBS_UP' });
  assert.equal(result.action, 'removed');
  assert.equal(destroyed, true);
});

test('toggleReaction rejects invalid emoji (too long)', async () => {
  await assert.rejects(
    toggleReaction({ messageId: 1, userId: 5, emoji: 'A'.repeat(17) }),
    /Invalid emoji/
  );
});

test('toggleReaction rejects empty emoji', async () => {
  await assert.rejects(
    toggleReaction({ messageId: 1, userId: 5, emoji: '' }),
    /Invalid emoji/
  );
});

// ===========================================================================
// getReactionSummary — aggregation
// ===========================================================================
test('getReactionSummary groups reactions by emoji correctly', async (t) => {
  t.mock.method(MessageReaction, 'findAll', async () => [
    { emoji: 'HEART', user_id: 1 },
    { emoji: 'HEART', user_id: 2 },
    { emoji: 'LOL',   user_id: 3 },
  ]);

  const summary = await getReactionSummary(1);
  assert.equal(summary['HEART'].count, 2);
  assert.equal(summary['HEART'].userIds.length, 2);
  assert.equal(summary['LOL'].count, 1);
  assert.deepEqual(summary['LOL'].userIds, [3]);
});

test('getReactionSummary returns empty object for unreacted message', async (t) => {
  t.mock.method(MessageReaction, 'findAll', async () => []);
  const summary = await getReactionSummary(99);
  assert.deepEqual(summary, {});
});

// ===========================================================================
// bulkLoadReactions — N+1 prevention
// ===========================================================================
test('bulkLoadReactions returns empty map for empty ids', async () => {
  const result = await bulkLoadReactions([]);
  assert.deepEqual(result, {});
});

test('bulkLoadReactions groups reactions by message_id', async (t) => {
  t.mock.method(MessageReaction, 'findAll', async () => [
    { message_id: 10, emoji: 'FIRE', user_id: 1 },
    { message_id: 10, emoji: 'FIRE', user_id: 2 },
    { message_id: 11, emoji: 'HEART', user_id: 3 },
  ]);

  const map = await bulkLoadReactions([10, 11]);
  assert.equal(map['10']['FIRE'].count, 2);
  assert.equal(map['11']['HEART'].count, 1);
  assert.equal(map['11']['HEART'].userIds[0], 3);
});

// ===========================================================================
// Same user cannot react with same emoji twice
// ===========================================================================
test('same user toggling same emoji twice results in net zero reactions', async (t) => {
  let callCount = 0;
  let reactionExists = false;
  t.mock.method(MessageReaction, 'findOne', async () => {
    return reactionExists ? { destroy: async () => { reactionExists = false; } } : null;
  });
  t.mock.method(MessageReaction, 'create', async () => { reactionExists = true; });
  t.mock.method(MessageReaction, 'findAll', async () =>
    reactionExists ? [{ emoji: 'FIRE', user_id: 5 }] : []
  );

  const first = await toggleReaction({ messageId: 1, userId: 5, emoji: 'FIRE' });
  assert.equal(first.action, 'added');

  const second = await toggleReaction({ messageId: 1, userId: 5, emoji: 'FIRE' });
  assert.equal(second.action, 'removed');
  assert.deepEqual(second.summary, {});
});
