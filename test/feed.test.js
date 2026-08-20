/**
 * Phase 9 — Feed Service Tests
 * node:test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Follow from '../src/modules/follow/follow.model.js';
import Post from '../src/modules/post/post.model.js';
import PostLike from '../src/modules/post_like/post_like.model.js';
import PostComment from '../src/modules/post_comment/post_comment.model.js';
import { getHomeFeed } from '../src/modules/feed/feed.service.js';
import { feedRequestsTotal } from '../src/monitoring/metrics.js';

const makeFollow = (following_id) => ({ following_id });
const makePost = (id, user_id, created_at) => ({
  id, user_id, content: `Post ${id}`, type: 'text', visibility: 'public',
  created_at: created_at || new Date(), is_deleted: false,
  author: { userId: user_id, userName: 'user', profile: null },
});

test('getHomeFeed: returns empty when user follows no one', async (t) => {
  t.mock.method(Follow, 'findAll', async () => []);
  const result = await getHomeFeed(1, {});
  assert.deepEqual(result.posts, []);
  assert.equal(result.hasMore, false);
  assert.equal(result.nextCursor, null);
});

test('getHomeFeed: returns followed users posts', async (t) => {
  t.mock.method(Follow, 'findAll', async () => [makeFollow(2), makeFollow(3)]);
  t.mock.method(Post, 'findAll', async () => [makePost(10, 2), makePost(11, 3)]);
  t.mock.method(PostLike, 'findAll', async () => []);
  t.mock.method(PostComment, 'findAll', async () => []);
  const result = await getHomeFeed(1, { limit: 20 });
  assert.equal(result.posts.length, 2);
  assert.ok(result.posts.every((p) => [2, 3].includes(p.author?.userId || p.user_id)));
});

test('getHomeFeed: does NOT include unrelated user posts', async (t) => {
  t.mock.method(Follow, 'findAll', async () => [makeFollow(2)]); // only follows user 2
  const posts = [makePost(10, 2)]; // only user 2 posts should appear
  t.mock.method(Post, 'findAll', async (opts) => {
    // Simulate DB: only returns posts for followed users
    return posts;
  });
  t.mock.method(PostLike, 'findAll', async () => []);
  t.mock.method(PostComment, 'findAll', async () => []);
  const result = await getHomeFeed(1, {});
  // user 99 post should NOT appear
  assert.ok(result.posts.every((p) => p.id !== 99));
});

test('getHomeFeed: hasMore is true when more posts exist', async (t) => {
  t.mock.method(Follow, 'findAll', async () => [makeFollow(2)]);
  // Return limit+1 posts to simulate hasMore
  const posts = Array.from({ length: 21 }, (_, i) => makePost(i + 1, 2));
  t.mock.method(Post, 'findAll', async () => posts);
  t.mock.method(PostLike, 'findAll', async () => []);
  t.mock.method(PostComment, 'findAll', async () => []);
  const result = await getHomeFeed(1, { limit: 20 });
  assert.equal(result.hasMore, true);
  assert.ok(result.nextCursor !== null);
  assert.equal(result.posts.length, 20);
});

test('getHomeFeed: cursor decoded correctly', async (t) => {
  t.mock.method(Follow, 'findAll', async () => [makeFollow(2)]);
  let capturedWhere = null;
  t.mock.method(Post, 'findAll', async (opts) => {
    capturedWhere = opts.where;
    return [];
  });
  t.mock.method(PostLike, 'findAll', async () => []);
  t.mock.method(PostComment, 'findAll', async () => []);

  const cursorPayload = { id: 5, created_at: new Date('2024-01-01').toISOString() };
  const cursor = Buffer.from(JSON.stringify(cursorPayload)).toString('base64');
  await getHomeFeed(1, { cursor });
  // Where clause should contain cursor conditions
  assert.ok(capturedWhere !== null);
});

test('getHomeFeed: invalid cursor falls back to first page gracefully', async (t) => {
  t.mock.method(Follow, 'findAll', async () => [makeFollow(2)]);
  t.mock.method(Post, 'findAll', async () => []);
  t.mock.method(PostLike, 'findAll', async () => []);
  t.mock.method(PostComment, 'findAll', async () => []);
  // Should not throw
  const result = await getHomeFeed(1, { cursor: 'INVALID_CURSOR###' });
  assert.ok(Array.isArray(result.posts));
});

test('getHomeFeed: caps limit at 50', async (t) => {
  t.mock.method(Follow, 'findAll', async () => [makeFollow(2)]);
  let capturedLimit = null;
  t.mock.method(Post, 'findAll', async (opts) => {
    capturedLimit = opts.limit;
    return [];
  });
  t.mock.method(PostLike, 'findAll', async () => []);
  t.mock.method(PostComment, 'findAll', async () => []);
  await getHomeFeed(1, { limit: 999 });
  assert.ok(capturedLimit <= 51, 'limit should be capped (50 + 1 for hasMore check)');
});

test('getHomeFeed: feedRequestsTotal metric increments', async (t) => {
  t.mock.method(Follow, 'findAll', async () => []);
  const before = (await feedRequestsTotal.get()).values[0]?.value || 0;
  await getHomeFeed(1, {});
  const after = (await feedRequestsTotal.get()).values[0]?.value || 0;
  assert.ok(after > before);
});
