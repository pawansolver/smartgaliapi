/**
 * Phase 9 — Post Likes Tests
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { UniqueConstraintError } from 'sequelize';
import Post from '../src/modules/post/post.model.js';
import PostLike from '../src/modules/post_like/post_like.model.js';
import { likePost, unlikePost, getLikeCount, likeDeps, LikeError } from '../src/modules/post_like/post_like.service.js';
import { postLikesTotal, postLikesFailedTotal } from '../src/monitoring/metrics.js';

const makePost = (o = {}) => ({ id: 1, user_id: 99, is_deleted: false, ...o });
const makeLike = (o = {}) => ({ id: 10, post_id: 1, user_id: 5, ...o });

test('likePost: successfully likes a post', async (t) => {
  t.mock.method(Post, 'findOne', async () => makePost());
  t.mock.method(PostLike, 'create', async () => makeLike({ id: 55 }));
  t.mock.method(likeDeps, 'createNotification', async () => null);
  t.mock.method(likeDeps, 'sendToUser', async () => ({ sent: 1 }));
  const result = await likePost(5, 1, 'like-1');
  assert.equal(result.likeId, 55);
  assert.equal(result.postId, 1);
});

test('likePost: rejects when post not found', async (t) => {
  t.mock.method(Post, 'findOne', async () => null);
  await assert.rejects(() => likePost(5, 999, 'like-2'), (err) => {
    assert.ok(err instanceof LikeError);
    assert.equal(err.statusCode, 404);
    return true;
  });
});

test('likePost: rejects duplicate like with 409', async (t) => {
  t.mock.method(Post, 'findOne', async () => makePost());
  t.mock.method(PostLike, 'create', async () => { throw new UniqueConstraintError({ errors: [] }); });
  await assert.rejects(() => likePost(5, 1, 'like-3'), (err) => {
    assert.ok(err instanceof LikeError);
    assert.equal(err.statusCode, 409);
    return true;
  });
});

test('likePost: FCM failure does NOT undo successful like', async (t) => {
  t.mock.method(Post, 'findOne', async () => makePost({ user_id: 99 }));
  t.mock.method(PostLike, 'create', async () => makeLike({ id: 66 }));
  t.mock.method(likeDeps, 'createNotification', async () => null);
  t.mock.method(likeDeps, 'sendToUser', async () => { throw new Error('FCM down'); });
  const result = await likePost(5, 1, 'like-fcm-fail');
  assert.equal(result.likeId, 66, 'Like persists despite FCM failure');
});

test('likePost: does not notify self-like', async (t) => {
  let notifCalled = false;
  t.mock.method(Post, 'findOne', async () => makePost({ user_id: 5 })); // same user
  t.mock.method(PostLike, 'create', async () => makeLike());
  t.mock.method(likeDeps, 'createNotification', async () => { notifCalled = true; return null; });
  t.mock.method(likeDeps, 'sendToUser', async () => ({ sent: 0 }));
  await likePost(5, 1, 'self-like-test');
  assert.equal(notifCalled, false, 'Notification should not fire for self-like');
});

test('unlikePost: successfully unlikes', async (t) => {
  t.mock.method(PostLike, 'destroy', async () => 1);
  const result = await unlikePost(5, 1, 'unlike-1');
  assert.equal(result.unliked, true);
});

test('unlikePost: idempotent when not liked', async (t) => {
  t.mock.method(PostLike, 'destroy', async () => 0);
  const result = await unlikePost(5, 999, 'unlike-2');
  assert.equal(result.unliked, false);
});

test('postLikesTotal metric increments on success', async (t) => {
  t.mock.method(Post, 'findOne', async () => makePost());
  t.mock.method(PostLike, 'create', async () => makeLike({ id: 77 }));
  t.mock.method(likeDeps, 'createNotification', async () => null);
  t.mock.method(likeDeps, 'sendToUser', async () => ({ sent: 1 }));
  const before = (await postLikesTotal.get()).values[0]?.value || 0;
  await likePost(5, 1, 'metric-like');
  const after = (await postLikesTotal.get()).values[0]?.value || 0;
  assert.ok(after > before);
});

test('LikeError has correct name and statusCode', () => {
  const err = new LikeError('test', 422);
  assert.equal(err.name, 'LikeError');
  assert.equal(err.statusCode, 422);
  assert.ok(err instanceof Error);
});
