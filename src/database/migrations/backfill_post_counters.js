/**
 * Counter Backfill & Verification Script - Phase 10
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Reconciles posts.likes_count, comments_count, shares_count with actual data.
 *
 * Process:
 *   1. Uses SQL GROUP BY aggregation (no app-level memory loading of all posts)
 *   2. Processes in batches of 500 for safety on large datasets
 *   3. UPDATE SET likes_count=actual, comments_count=actual, shares_count=actual
 *      WHERE the stored value differs (avoids unnecessary writes)
 *   4. Reports total reconciled + any remaining mismatches
 *
 * Idempotent: safe to run multiple times.
 *
 * Usage:
 *   node src/database/migrations/backfill_post_counters.js
 *   DRY_RUN=true node src/database/migrations/backfill_post_counters.js
 *
 * Options:
 *   DRY_RUN=true - Report mismatches only, do not UPDATE
 */

import sequelize from '../../config/db.js';

const DRY_RUN = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run');
const BATCH_SIZE = 500;

const backfillCounters = async () => {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log('Post Counter Backfill Script');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (report only, no UPDATE)' : 'LIVE (will UPDATE mismatches)'}`);
  console.log('='.repeat(60));

  let offset = 0;
  let totalScanned = 0;
  let totalMismatches = 0;
  let totalUpdated = 0;

  while (true) {
    const posts = await sequelize.query(
      'SELECT id, likes_count, comments_count, shares_count FROM posts WHERE is_deleted = 0 ORDER BY id ASC LIMIT ? OFFSET ?',
      { replacements: [BATCH_SIZE, offset], type: sequelize.QueryTypes.SELECT }
    );

    if (posts.length === 0) break;

    const postIds = posts.map((p) => Number(p.id));

    // Aggregate actual counts efficiently
    const [actualLikes, actualComments, actualShares] = await Promise.all([
      sequelize.query(
        'SELECT post_id, COUNT(*) AS cnt FROM post_likes WHERE post_id IN (?) GROUP BY post_id',
        { replacements: [postIds], type: sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        'SELECT post_id, COUNT(*) AS cnt FROM post_comments WHERE post_id IN (?) AND is_deleted = 0 GROUP BY post_id',
        { replacements: [postIds], type: sequelize.QueryTypes.SELECT }
      ),
      sequelize.query(
        'SELECT post_id, COUNT(*) AS cnt FROM post_shares WHERE post_id IN (?) AND is_deleted = 0 GROUP BY post_id',
        { replacements: [postIds], type: sequelize.QueryTypes.SELECT }
      ),
    ]);

    const likeMap = new Map(actualLikes.map((r) => [Number(r.post_id), Number(r.cnt)]));
    const commentMap = new Map(actualComments.map((r) => [Number(r.post_id), Number(r.cnt)]));
    const shareMap = new Map(actualShares.map((r) => [Number(r.post_id), Number(r.cnt)]));

    const toUpdate = [];
    for (const post of posts) {
      const postId = Number(post.id);
      const actualLike = likeMap.get(postId) || 0;
      const actualComment = commentMap.get(postId) || 0;
      const actualShare = shareMap.get(postId) || 0;

      if (
        Number(post.likes_count) !== actualLike ||
        Number(post.comments_count) !== actualComment ||
        Number(post.shares_count) !== actualShare
      ) {
        totalMismatches++;
        console.log(`  MISMATCH post_id=${postId}: ` +
          `likes(stored=${post.likes_count}, actual=${actualLike}) ` +
          `comments(stored=${post.comments_count}, actual=${actualComment}) ` +
          `shares(stored=${post.shares_count}, actual=${actualShare})`);
        toUpdate.push({ id: postId, likes: actualLike, comments: actualComment, shares: actualShare });
      }
    }

    if (!DRY_RUN && toUpdate.length > 0) {
      for (const row of toUpdate) {
        await sequelize.query(
          'UPDATE posts SET likes_count = ?, comments_count = ?, shares_count = ? WHERE id = ?',
          { replacements: [row.likes, row.comments, row.shares, row.id] }
        );
        totalUpdated++;
      }
    }

    totalScanned += posts.length;
    offset += BATCH_SIZE;
  }

  // â”€â”€ Verification query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  console.log(`\n${'â”€'.repeat(60)}`);
  console.log('VERIFICATION: Checking for remaining mismatches...');
  const remaining = await sequelize.query(`
    SELECT p.id,
      p.likes_count AS stored_likes, l.actual_likes,
      p.comments_count AS stored_comments, c.actual_comments,
      p.shares_count AS stored_shares, s.actual_shares
    FROM posts p
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS actual_likes FROM post_likes GROUP BY post_id
    ) l ON l.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS actual_comments FROM post_comments WHERE is_deleted = 0 GROUP BY post_id
    ) c ON c.post_id = p.id
    LEFT JOIN (
      SELECT post_id, COUNT(*) AS actual_shares FROM post_shares WHERE is_deleted = 0 GROUP BY post_id
    ) s ON s.post_id = p.id
    WHERE p.is_deleted = 0
      AND (
        p.likes_count != COALESCE(l.actual_likes, 0)
        OR p.comments_count != COALESCE(c.actual_comments, 0)
        OR p.shares_count != COALESCE(s.actual_shares, 0)
      )
    LIMIT 20
  `, { type: sequelize.QueryTypes.SELECT });

  if (remaining.length === 0) {
    console.log('âœ… VERIFICATION PASSED: All post counters are consistent.');
  } else {
    console.warn(`âš ï¸  VERIFICATION: ${remaining.length} post(s) still have mismatches:`);
    for (const r of remaining) {
      console.warn(`  post_id=${r.id}: likes(${r.stored_likes}!=${r.actual_likes}), comments(${r.stored_comments}!=${r.actual_comments}), shares(${r.stored_shares}!=${r.actual_shares})`);
    }
  }

  const summary = {
    dryRun: DRY_RUN,
    totalScanned,
    totalMismatches,
    totalUpdated: DRY_RUN ? 0 : totalUpdated,
    remainingMismatches: remaining.length,
    durationMs: Date.now() - startTime,
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log('Backfill Summary:');
  console.log(JSON.stringify(summary, null, 2));
  return summary;
};

const isMain = process.argv[1] && process.argv[1].endsWith('backfill_post_counters.js');
if (isMain) {
  import('../../config/db.js').then(({ connectDB }) => connectDB()).then(() => {
    return backfillCounters();
  }).then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}

export { backfillCounters };
export default { backfillCounters };
