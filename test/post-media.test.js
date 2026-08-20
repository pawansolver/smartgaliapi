/**
 * Phase 9 — Post Media Tests
 * node:test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { POST_MEDIA_TYPES } from '../src/utils/postMediaUpload.js';
import {
  up as upPostsFeed,
  down as downPostsFeed,
  version as postsFeedVersion,
} from '../scripts/migrations/009-posts-feed.js';
import {
  mediaUploadsTotal,
  mediaUploadFailuresTotal,
} from '../src/monitoring/metrics.js';

// ─── MIME type validation ─────────────────────────────────────────────────────

test('POST_MEDIA_TYPES accepts valid image types', () => {
  const validImages = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  for (const mime of validImages) {
    assert.ok(POST_MEDIA_TYPES[mime], `${mime} should be an accepted image type`);
    assert.equal(POST_MEDIA_TYPES[mime].kind, 'image');
  }
});

test('POST_MEDIA_TYPES accepts valid video types', () => {
  const validVideos = ['video/mp4', 'video/quicktime', 'video/webm'];
  for (const mime of validVideos) {
    assert.ok(POST_MEDIA_TYPES[mime], `${mime} should be an accepted video type`);
    assert.equal(POST_MEDIA_TYPES[mime].kind, 'video');
  }
});

test('POST_MEDIA_TYPES does NOT accept executable types', () => {
  const dangerous = [
    'application/x-executable',
    'application/x-sh',
    'text/x-script',
    'application/octet-stream',
    'application/x-php',
  ];
  for (const mime of dangerous) {
    assert.ok(!POST_MEDIA_TYPES[mime], `${mime} must NOT be an accepted type`);
  }
});

test('POST_MEDIA_TYPES does NOT accept document types (PDF, Word)', () => {
  const docs = ['application/pdf', 'application/msword'];
  for (const mime of docs) {
    assert.ok(!POST_MEDIA_TYPES[mime], `${mime} must NOT be accepted for posts`);
  }
});

test('Image max size is 10 MB', () => {
  for (const [mime, info] of Object.entries(POST_MEDIA_TYPES)) {
    if (info.kind === 'image') {
      assert.ok(info.maxMB <= 10, `Image MIME ${mime} must have maxMB <= 10, got ${info.maxMB}`);
    }
  }
});

test('Video max size is 100 MB', () => {
  for (const [mime, info] of Object.entries(POST_MEDIA_TYPES)) {
    if (info.kind === 'video') {
      assert.ok(info.maxMB <= 100, `Video MIME ${mime} must have maxMB <= 100, got ${info.maxMB}`);
    }
  }
});

// ─── Migration 009 ────────────────────────────────────────────────────────────

test('009-posts-feed migration has correct version string', () => {
  assert.equal(postsFeedVersion, '009-posts-feed');
});

test('009-posts-feed migration up creates all indexes', async () => {
  let syncedModels = [];
  let addedIndexes = [];

  const mockModel = (name) => ({
    sync: async () => { syncedModels.push(name); },
    getTableName: () => name,
  });

  const mockQI = {
    showIndex: async () => [],
    addIndex: async (table, fields, opts) => { addedIndexes.push(opts.name); },
  };

  await upPostsFeed({
    postModel: mockModel('posts'),
    postLikeModel: mockModel('post_likes'),
    postCommentModel: mockModel('post_comments'),
    queryInterface: mockQI,
  });

  assert.ok(addedIndexes.includes('ix_posts_user_id_created_at'), 'Feed index should be added');
  assert.ok(addedIndexes.includes('ix_posts_created_at'), 'created_at index should be added');
  assert.ok(addedIndexes.includes('uq_post_likes_post_user'), 'Unique like constraint should be added');
  assert.ok(addedIndexes.includes('ix_post_likes_post_id'), 'Post ID like index should be added');
  assert.ok(addedIndexes.includes('ix_post_likes_user_id'), 'User ID like index should be added');
  assert.ok(addedIndexes.includes('ix_post_comments_post_id'), 'Comment index should be added');
  assert.equal(syncedModels.length, 3, '3 models should be synced');
});

test('009-posts-feed migration down removes indexes gracefully', async () => {
  let removedIndexes = [];
  const mockModel = (name) => ({ getTableName: () => name });
  const mockQI = {
    showAllTables: async () => ['posts', 'post_likes', 'post_comments'],
    showIndex: async () => [
      { name: 'ix_posts_user_id_created_at', primary: false },
      { name: 'uq_post_likes_post_user', primary: false },
      { name: 'ix_post_comments_post_id', primary: false },
    ],
    removeIndex: async (table, name) => { removedIndexes.push(name); },
  };
  await downPostsFeed({
    postModel: mockModel('posts'),
    postLikeModel: mockModel('post_likes'),
    postCommentModel: mockModel('post_comments'),
    queryInterface: mockQI,
  });
  assert.ok(removedIndexes.length > 0, 'Indexes should be removed');
});

test('009-posts-feed down handles missing tables gracefully', async () => {
  const mockModel = (name) => ({ getTableName: () => name });
  const mockQI = {
    showAllTables: async () => [], // tables not present
    showIndex: async () => [],
    removeIndex: async () => {},
  };
  // Should not throw
  await downPostsFeed({
    postModel: mockModel('posts'),
    postLikeModel: mockModel('post_likes'),
    postCommentModel: mockModel('post_comments'),
    queryInterface: mockQI,
  });
});

// ─── Metrics safety ───────────────────────────────────────────────────────────

test('media metrics have no high-cardinality labels', async () => {
  const vals = [
    ...(await mediaUploadsTotal.get()).values,
    ...(await mediaUploadFailuresTotal.get()).values,
  ];
  const forbidden = ['user_id', 'email', 'phone', 'post_id', 'token'];
  for (const val of vals) {
    for (const label of forbidden) {
      assert.ok(
        !Object.keys(val.labels || {}).includes(label),
        `Media metric must not have '${label}' label`
      );
    }
  }
});

test('mediaUploadsTotal only uses low-cardinality media_type labels', async () => {
  const vals = (await mediaUploadsTotal.get()).values;
  const allowed = new Set(['image', 'video', 'audio', 'document', 'other', undefined]);
  for (const val of vals) {
    assert.ok(
      allowed.has(val.labels?.media_type),
      `Unexpected media_type label: ${val.labels?.media_type}`
    );
  }
});
