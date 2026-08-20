/**
 * Phase 9 — Post Comments Tests
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Post from '../src/modules/post/post.model.js';
import PostComment from '../src/modules/post_comment/post_comment.model.js';
import { addComment, getComments, commentDeps, CommentError } from '../src/modules/post_comment/post_comment.service.js';
import { postCommentsTotal } from '../src/monitoring/metrics.js';

const makePost = (o = {}) => ({ id: 1, user_id: 99, is_deleted: false, ...o });
const makeComment = (o = {}) => ({
  id: 10, post_id: 1, user_id: 5, content: 'Test comment',
  created_at: new Date(), ...o,
});

test('addComment: successfully adds a comment', async (t) => {
  t.mock.method(Post, 'findOne', async () => makePost());
  t.mock.method(PostComment, 'create', async (d) => makeComment({ ...d, id: 55 }));
  t.mock.method(commentDeps, 'createNotification', async () => null);
  t.mock.method(commentDeps, 'sendToUser', async () => ({ sent: 1 }));
  const result = await addComment(5, 1, 'Hello!', 'comm-1');
  assert.equal(result.commentId, 55);
  assert.equal(result.content, 'Hello!');
});

test('addComment: rejects empty content', async (t) => {
  await assert.rejects(() => addComment(5, 1, '', 'comm-2'), (err) => {
    assert.ok(err instanceof CommentError);
    assert.equal(err.statusCode, 400);
    return true;
  });
});

test('addComment: rejects null content', async (t) => {
  await assert.rejects(() => addComment(5, 1, null, 'comm-3'), (err) => {
    assert.ok(err instanceof CommentError);
    return true;
  });
});

test('addComment: rejects content exceeding 2000 chars', async (t) => {
  await assert.rejects(
    () => addComment(5, 1, 'x'.repeat(2001), 'comm-4'),
    (err) => { assert.ok(err instanceof CommentError); return true; }
  );
});

test('addComment: rejects when post not found', async (t) => {
  t.mock.method(Post, 'findOne', async () => null);
  await assert.rejects(() => addComment(5, 999, 'Hi!', 'comm-5'), (err) => {
    assert.ok(err instanceof CommentError);
    assert.equal(err.statusCode, 404);
    return true;
  });
});

test('addComment: FCM failure does NOT undo successful comment', async (t) => {
  t.mock.method(Post, 'findOne', async () => makePost({ user_id: 99 }));
  t.mock.method(PostComment, 'create', async (d) => makeComment({ ...d, id: 66 }));
  t.mock.method(commentDeps, 'createNotification', async () => null);
  t.mock.method(commentDeps, 'sendToUser', async () => { throw new Error('FCM down'); });
  const result = await addComment(5, 1, 'Survives FCM fail!', 'comm-6');
  assert.equal(result.commentId, 66);
});

test('addComment: does not expose sensitive data in response', async (t) => {
  t.mock.method(Post, 'findOne', async () => makePost());
  t.mock.method(PostComment, 'create', async (d) => makeComment({ ...d, id: 77 }));
  t.mock.method(commentDeps, 'createNotification', async () => null);
  t.mock.method(commentDeps, 'sendToUser', async () => ({ sent: 1 }));
  const result = await addComment(5, 1, 'Safe comment', 'comm-7');
  assert.ok(!result.password, 'No password in response');
  assert.ok(!result.email, 'No email in response');
  assert.ok('commentId' in result);
  assert.ok('content' in result);
});

test('getComments: returns paginated comments', async (t) => {
  const mockUser = { userId: 5, userName: 'alice', profile: { fullName: 'Alice', avatarUrl: null } };
  t.mock.method(PostComment, 'findAndCountAll', async () => ({
    count: 1,
    rows: [makeComment({ user: mockUser })],
  }));
  const result = await getComments(1, { page: 1, limit: 10 });
  assert.equal(result.total, 1);
  assert.equal(result.comments.length, 1);
  assert.ok('author' in result.comments[0]);
  assert.ok(!result.comments[0].author.password, 'No password in comment author');
});

test('getComments: returns empty for post with no comments', async (t) => {
  t.mock.method(PostComment, 'findAndCountAll', async () => ({ count: 0, rows: [] }));
  const result = await getComments(999, {});
  assert.equal(result.total, 0);
  assert.deepEqual(result.comments, []);
});

test('postCommentsTotal metric increments', async (t) => {
  t.mock.method(Post, 'findOne', async () => makePost());
  t.mock.method(PostComment, 'create', async (d) => makeComment({ ...d, id: 88 }));
  t.mock.method(commentDeps, 'createNotification', async () => null);
  t.mock.method(commentDeps, 'sendToUser', async () => ({ sent: 1 }));
  const before = (await postCommentsTotal.get()).values[0]?.value || 0;
  await addComment(5, 1, 'Metric test', 'metric-comm');
  const after = (await postCommentsTotal.get()).values[0]?.value || 0;
  assert.ok(after > before);
});
