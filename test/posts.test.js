/**
 * Phase 9 — Post Service Tests
 * node:test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Post from '../src/modules/post/post.model.js';
import MediaFile from '../src/modules/media_file/media_file.model.js';
import { createPost, getPostById, PostError, serializePost } from '../src/modules/post/post.service.js';
import { postsCreatedTotal, postsCreationFailedTotal } from '../src/monitoring/metrics.js';

const makePost = (o = {}) => ({
  id: 1, user_id: 10, content: 'Hello SmartGali', type: 'text',
  visibility: 'public', created_at: new Date(), is_deleted: false,
  author: null, ...o,
});
const makeMedia = (o = {}) => ({ id: 5, uploaded_by: 10, is_deleted: false, ...o });

test('createPost: successfully creates a text post', async (t) => {
  t.mock.method(MediaFile, 'findAll', async () => []);
  t.mock.method(Post, 'create', async (data) => makePost({ ...data, id: 42 }));
  const result = await createPost(10, { content: 'Hello World', visibility: 'public' }, 'corr-1');
  assert.equal(result.id, 42);
  assert.equal(result.content, 'Hello World');
});

test('createPost: rejects empty post (no content, no media)', async (t) => {
  await assert.rejects(() => createPost(10, {}, 'corr-2'), (err) => {
    assert.ok(err instanceof PostError);
    assert.equal(err.statusCode, 400);
    return true;
  });
});

test('createPost: rejects content exceeding 5000 chars', async (t) => {
  await assert.rejects(
    () => createPost(10, { content: 'x'.repeat(5001) }, 'corr-3'),
    (err) => { assert.ok(err instanceof PostError); assert.equal(err.statusCode, 400); return true; }
  );
});

test('createPost: rejects invalid post type', async (t) => {
  await assert.rejects(
    () => createPost(10, { content: 'hi', type: 'invalid_type' }, 'corr-4'),
    (err) => { assert.ok(err instanceof PostError); return true; }
  );
});

test('createPost: rejects invalid visibility', async (t) => {
  await assert.rejects(
    () => createPost(10, { content: 'hi', visibility: 'secret' }, 'corr-5'),
    (err) => { assert.ok(err instanceof PostError); return true; }
  );
});

test('createPost: rejects media not owned by author', async (t) => {
  t.mock.method(MediaFile, 'findAll', async () => [makeMedia({ id: 5, uploaded_by: 99 })]);
  await assert.rejects(
    () => createPost(10, { content: 'hi', mediaIds: [5] }, 'corr-6'),
    (err) => { assert.ok(err instanceof PostError); assert.equal(err.statusCode, 403); return true; }
  );
});

test('createPost: rejects media not found', async (t) => {
  t.mock.method(MediaFile, 'findAll', async () => []); // returns empty — media IDs not found
  await assert.rejects(
    () => createPost(10, { content: 'hi', mediaIds: [999] }, 'corr-7'),
    (err) => { assert.ok(err instanceof PostError); assert.equal(err.statusCode, 400); return true; }
  );
});

test('createPost: rejects too many media files', async (t) => {
  await assert.rejects(
    () => createPost(10, { content: 'hi', mediaIds: [1,2,3,4,5,6] }, 'corr-8'),
    (err) => { assert.ok(err instanceof PostError); return true; }
  );
});

test('createPost: author comes from first arg (JWT), not body', async (t) => {
  t.mock.method(MediaFile, 'findAll', async () => []);
  let capturedData = null;
  t.mock.method(Post, 'create', async (data) => {
    capturedData = data;
    return makePost({ ...data, id: 77 });
  });
  await createPost(10, { content: 'hi', user_id: 999 }, 'corr-9'); // body user_id should be ignored
  assert.equal(capturedData.user_id, 10, 'user_id must come from JWT argument, not body');
  assert.notEqual(capturedData.user_id, 999);
});

test('getPostById: returns null for non-existent post', async (t) => {
  t.mock.method(Post, 'findOne', async () => null);
  const result = await getPostById(9999);
  assert.equal(result, null);
});

test('serializePost: never exposes sensitive fields', () => {
  const post = makePost({ user_id: 1, password: 'hash', email: 'a@b.com' });
  const result = serializePost(post, null, []);
  assert.ok(!result.password, 'password must not be in response');
  assert.ok(!result.email, 'email must not be in response');
  assert.ok('id' in result);
  assert.ok('content' in result);
});

test('postsCreationFailedTotal increments on empty post', async () => {
  const before = (await postsCreationFailedTotal.get()).values
    .find((v) => v.labels?.reason === 'empty_post')?.value || 0;
  await assert.rejects(() => createPost(10, {}, 'metric-test'));
  const after = (await postsCreationFailedTotal.get()).values
    .find((v) => v.labels?.reason === 'empty_post')?.value || 0;
  assert.ok(after > before);
});
