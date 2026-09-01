/**
 * Migration: Feed & Post Performance Indexes - Phase 10
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Run with: node src/database/migrations/add_feed_post_indexes.js
 *
 * All indexes are justified against actual query patterns.
 * Uses CREATE INDEX IF NOT EXISTS for idempotency.
 * MySQL (InnoDB) compatible syntax.
 */

import sequelize from '../../config/db.js';

const INDEXES = [
  // â”€â”€ posts table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Main feed query: WHERE user_id IN (...) AND is_deleted=0 ORDER BY created_at DESC, id DESC
  {
    name: 'idx_posts_user_deleted_created',
    sql: 'CREATE INDEX IF NOT EXISTS idx_posts_user_deleted_created ON posts (user_id, is_deleted, created_at DESC, id DESC)',
    reason: 'Main feed query filter + sort. Covers user_id IN, is_deleted=false, ORDER BY.',
  },
  // Cursor WHERE clause: WHERE (created_at < X) OR (created_at = X AND id < Y)
  {
    name: 'idx_posts_created_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_posts_created_id ON posts (created_at DESC, id DESC)',
    reason: 'Keyset cursor WHERE clause - avoids full table scan on cursor pagination.',
  },
  // Visibility filter (future public/community feed)
  {
    name: 'idx_posts_visibility_deleted',
    sql: 'CREATE INDEX IF NOT EXISTS idx_posts_visibility_deleted ON posts (visibility, is_deleted, created_at DESC)',
    reason: 'Future public feed: WHERE visibility=public AND is_deleted=0 ORDER BY created_at DESC.',
  },

  // â”€â”€ post_likes table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Batch like-count fetch: WHERE post_id IN (...)
  {
    name: 'idx_post_likes_post_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes (post_id)',
    reason: 'Batch like count fetch in feed. High-frequency read.',
  },
  // isLikedByMe: WHERE post_id IN (...) AND user_id = ?
  {
    name: 'idx_post_likes_post_user',
    sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_post_likes_post_user ON post_likes (post_id, user_id)',
    reason: 'isLikedByMe batch fetch + duplicate like prevention. Unique constraint.',
  },

  // â”€â”€ post_comments table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Batch comment count fetch + filter
  {
    name: 'idx_post_comments_post_deleted',
    sql: 'CREATE INDEX IF NOT EXISTS idx_post_comments_post_deleted ON post_comments (post_id, is_deleted)',
    reason: 'Batch comment count fetch. WHERE post_id IN (...) AND is_deleted=0.',
  },
  // Cursor pagination: WHERE post_id=? AND is_deleted=0 AND (created_at > X OR ...) ORDER BY created_at ASC, id ASC
  {
    name: 'idx_post_comments_post_created',
    sql: 'CREATE INDEX IF NOT EXISTS idx_post_comments_post_created ON post_comments (post_id, created_at ASC, id ASC)',
    reason: 'Keyset cursor for comment pagination. Replaces slow OFFSET scan.',
  },

  // â”€â”€ saved_posts table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // isSaved batch: WHERE user_id=? AND post_id IN (...) AND is_deleted=0
  {
    name: 'idx_saved_posts_user_post',
    sql: 'CREATE INDEX IF NOT EXISTS idx_saved_posts_user_post ON saved_posts (user_id, post_id, is_deleted)',
    reason: 'Batch isSaved check in feed for current user.',
  },

  // â”€â”€ post_shares table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Batch share count
  {
    name: 'idx_post_shares_post_deleted',
    sql: 'CREATE INDEX IF NOT EXISTS idx_post_shares_post_deleted ON post_shares (post_id, is_deleted)',
    reason: 'Batch share count fetch in feed.',
  },

  // â”€â”€ post_views table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Dedup check: WHERE user_id=? AND post_id IN (?) AND viewed_at >= ?
  {
    name: 'idx_post_views_user_post_viewed',
    sql: 'CREATE INDEX IF NOT EXISTS idx_post_views_user_post_viewed ON post_views (user_id, post_id, viewed_at)',
    reason: 'Dedup lookup for batch-views: prevent recording same view twice in 1h window.',
  },

  // â”€â”€ follows table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Feed graph query: WHERE follower_id=? AND is_deleted=0
  {
    name: 'idx_follows_follower_deleted',
    sql: 'CREATE INDEX IF NOT EXISTS idx_follows_follower_deleted ON follows (follower_id, is_deleted)',
    reason: 'Every feed request loads followed user IDs. High-frequency read.',
  },

  // â”€â”€ user_mutes / user_blocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    name: 'idx_user_mutes_user',
    sql: 'CREATE INDEX IF NOT EXISTS idx_user_mutes_user ON user_mutes (user_id)',
    reason: 'UNION query for excluded users in feed.',
  },
  {
    name: 'idx_user_blocks_user',
    sql: 'CREATE INDEX IF NOT EXISTS idx_user_blocks_user ON user_blocks (user_id)',
    reason: 'UNION query for excluded users in feed.',
  },
];

const runMigration = async () => {
  const startTime = Date.now();
  console.log('Starting Feed & Post index migration...');

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const idx of INDEXES) {
    try {
      await sequelize.query(idx.sql);
      console.log(`  âœ“ ${idx.name}: ${idx.reason}`);
      created++;
    } catch (err) {
      if (err.message && (err.message.includes('already exists') || err.message.includes('Duplicate'))) {
        console.log(`  ~ ${idx.name}: already exists (skipped)`);
        skipped++;
      } else {
        console.error(`  âœ— ${idx.name}: ${err.message}`);
        errors++;
      }
    }
  }

  console.log(`\nMigration complete in ${Date.now() - startTime}ms:`);
  console.log(`  Created: ${created}, Already existed: ${skipped}, Errors: ${errors}`);
  return { created, skipped, errors };
};

// Standalone execution
const isMain = process.argv[1] && process.argv[1].endsWith('add_feed_post_indexes.js');
if (isMain) {
  import('../../config/db.js').then(({ connectDB }) => connectDB()).then(() => {
    return runMigration();
  }).then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

export { runMigration };
export default { runMigration };
