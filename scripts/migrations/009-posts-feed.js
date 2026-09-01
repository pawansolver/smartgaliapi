/**
 * Migration 009 — Posts & Feed Indexes
 * Phase 9: Posts & Home Feed System
 *
 * Indexes:
 *   ix_posts_user_id_created_at     (user_id, created_at DESC) — Feed query
 *   ix_posts_created_at             (created_at DESC)           — Global sort
 *   ix_post_likes_post_id           (post_id)                   — Like count queries
 *   ix_post_likes_user_id           (user_id)                   — "Did I like this?" queries
 *   uq_post_likes_post_user         UNIQUE(post_id, user_id)    — Prevent duplicate likes
 *   ix_post_comments_post_id        (post_id)                   — Comment list queries
 */

import sequelize from '../../src/config/db.js';
import Post from '../../src/modules/post/post.model.js';
import PostLike from '../../src/modules/post_like/post_like.model.js';
import PostComment from '../../src/modules/post_comment/post_comment.model.js';

export const version = '009-posts-feed';

const ensureIndex = async (queryInterface, table, fields, name, options = {}) => {
  const indexes = await queryInterface.showIndex(table);
  const alreadyExists = indexes.some((idx) => idx.name === name);
  if (!alreadyExists) {
    await queryInterface.addIndex(table, fields, { ...options, name });
    console.log('  Added: ' + name);
  } else {
    console.log('  Skipped (exists): ' + name);
  }
};

const removeIndexIfPresent = async (queryInterface, table, name) => {
  const indexes = await queryInterface.showIndex(table);
  const target = indexes.find((idx) => idx.name === name);
  if (!target) return;
  if (target.primary) {
    console.log('  Skipping primary key: ' + name);
    return;
  }
  try {
    await queryInterface.removeIndex(table, name);
    console.log('  Removed: ' + name);
  } catch (err) {
    if (err.original && err.original.code === 'ER_DROP_INDEX_FK') {
      console.log('  Skipped (FK constraint): ' + name);
    } else {
      throw err;
    }
  }
};

export const up = async ({
  postModel = Post,
  postLikeModel = PostLike,
  postCommentModel = PostComment,
  queryInterface = sequelize.getQueryInterface(),
} = {}) => {
  console.log('[009-posts-feed] UP...');

  // Sync tables
  await postModel.sync();
  await postLikeModel.sync();
  await postCommentModel.sync();

  const postsTable = typeof postModel.getTableName === 'function' ? postModel.getTableName() : 'posts';
  const likesTable = typeof postLikeModel.getTableName === 'function' ? postLikeModel.getTableName() : 'post_likes';
  const commentsTable = typeof postCommentModel.getTableName === 'function' ? postCommentModel.getTableName() : 'post_comments';

  // Posts indexes
  await ensureIndex(queryInterface, postsTable, ['user_id', 'created_at'], 'ix_posts_user_id_created_at');
  await ensureIndex(queryInterface, postsTable, ['created_at'], 'ix_posts_created_at');

  // PostLike indexes
  await ensureIndex(queryInterface, likesTable, ['post_id', 'user_id'], 'uq_post_likes_post_user', { unique: true });
  await ensureIndex(queryInterface, likesTable, ['post_id'], 'ix_post_likes_post_id');
  await ensureIndex(queryInterface, likesTable, ['user_id'], 'ix_post_likes_user_id');

  // PostComment indexes
  await ensureIndex(queryInterface, commentsTable, ['post_id'], 'ix_post_comments_post_id');

  console.log('[009-posts-feed] UP complete.');
};

export const down = async ({
  queryInterface = sequelize.getQueryInterface(),
  postModel = Post,
  postLikeModel = PostLike,
  postCommentModel = PostComment,
} = {}) => {
  console.log('[009-posts-feed] DOWN...');

  const postsTable = typeof postModel.getTableName === 'function' ? postModel.getTableName() : 'posts';
  const likesTable = typeof postLikeModel.getTableName === 'function' ? postLikeModel.getTableName() : 'post_likes';
  const commentsTable = typeof postCommentModel.getTableName === 'function' ? postCommentModel.getTableName() : 'post_comments';

  const allTables = (await queryInterface.showAllTables()).map((t) =>
    typeof t === 'string' ? t : (t.tableName || t.table_name),
  );

  if (allTables.includes(postsTable)) {
    await removeIndexIfPresent(queryInterface, postsTable, 'ix_posts_user_id_created_at');
    await removeIndexIfPresent(queryInterface, postsTable, 'ix_posts_created_at');
  }
  if (allTables.includes(likesTable)) {
    await removeIndexIfPresent(queryInterface, likesTable, 'uq_post_likes_post_user');
    await removeIndexIfPresent(queryInterface, likesTable, 'ix_post_likes_post_id');
    await removeIndexIfPresent(queryInterface, likesTable, 'ix_post_likes_user_id');
  }
  if (allTables.includes(commentsTable)) {
    await removeIndexIfPresent(queryInterface, commentsTable, 'ix_post_comments_post_id');
  }

  console.log('[009-posts-feed] DOWN complete.');
};
