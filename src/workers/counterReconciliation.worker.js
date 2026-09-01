/**
 * Counter Reconciliation Worker - Phase 10 & Phase 19 Hardened
 * ─────────────────────────────────────────────────────────────────────────────
 * Detects and repairs counter drift between stored counters and actual rows.
 * Handles:
 *  1. Posts (likes_count, comments_count, shares_count)
 *  2. Communities (members_count, posts_count)
 *  3. Polls (total_votes)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import sequelize from '../config/db.js';
import { logger } from '../utils/logger.js';
import {
  postCounterMismatchTotal,
  postCounterReconciliationTotal,
  postCounterRepairTotal,
} from '../monitoring/metrics.js';

const DRY_RUN = process.env.COUNTER_RECONCILE_DRY_RUN === 'true';
const BATCH_SIZE = 1000;

export const reconcileCommunityCounters = async () => {
  logger.info('RECONCILE', 'community_reconciliation_started', { dryRun: DRY_RUN });
  let mismatches = 0;
  let repaired = 0;

  try {
    const [communities] = await sequelize.query(`
      SELECT c.communityId, c.members_count, c.posts_count,
        (SELECT COUNT(*) FROM community_members m WHERE m.community_id = c.communityId AND m.status = 'active' AND m.is_deleted = 0) AS actual_members,
        (SELECT COUNT(*) FROM posts p WHERE p.community_id = c.communityId AND p.is_deleted = 0) AS actual_posts
      FROM communities c
      WHERE c.is_deleted = 0
    `);

    for (const comm of communities) {
      const storedMembers = Number(comm.members_count || 0);
      const actualMembers = Number(comm.actual_members || 0);
      const storedPosts = Number(comm.posts_count || 0);
      const actualPosts = Number(comm.actual_posts || 0);

      if (storedMembers !== actualMembers || storedPosts !== actualPosts) {
        mismatches++;
        if (!DRY_RUN) {
          await sequelize.query(
            'UPDATE communities SET members_count = ?, posts_count = ? WHERE communityId = ?',
            { replacements: [actualMembers, actualPosts, comm.communityId] },
          );
          repaired++;
        }
      }
    }
  } catch (error) {
    logger.error('RECONCILE', 'community_reconciliation_failed', { error: error.message });
  }

  logger.info('RECONCILE', 'community_reconciliation_completed', { mismatches, repaired });
  return { mismatches, repaired };
};

export const reconcilePostCounters = async () => {
  const startTime = Date.now();
  let totalMismatches = 0;
  let totalRepaired = 0;
  let offset = 0;
  let batchCount = 0;

  logger.info('RECONCILE', 'reconciliation_started', { dryRun: DRY_RUN });

  while (true) {
    const [posts] = await sequelize.query(
      `SELECT id, likes_count, comments_count, shares_count
       FROM posts
       WHERE is_deleted = 0
       ORDER BY id ASC
       LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
    );

    if (!posts || posts.length === 0) break;
    batchCount++;

    const postIds = posts.map((p) => p.id);
    const idList = postIds.join(',');

    const [likeCounts] = await sequelize.query(
      `SELECT post_id, COUNT(*) AS count FROM post_likes WHERE post_id IN (${idList}) GROUP BY post_id`,
    );
    const [commentCounts] = await sequelize.query(
      `SELECT post_id, COUNT(*) AS count FROM post_comments WHERE post_id IN (${idList}) AND is_deleted = 0 GROUP BY post_id`,
    );
    const [shareCounts] = await sequelize.query(
      `SELECT post_id, COUNT(*) AS count FROM post_shares WHERE post_id IN (${idList}) GROUP BY post_id`,
    );

    const actualLikes = new Map(likeCounts.map((r) => [r.post_id, Number(r.count)]));
    const actualComments = new Map(commentCounts.map((r) => [r.post_id, Number(r.count)]));
    const actualShares = new Map(shareCounts.map((r) => [r.post_id, Number(r.count)]));

    for (const post of posts) {
      const realLikes = actualLikes.get(post.id) ?? 0;
      const realComments = actualComments.get(post.id) ?? 0;
      const realShares = actualShares.get(post.id) ?? 0;

      const hasLikeMismatch = post.likes_count !== realLikes;
      const hasCommentMismatch = post.comments_count !== realComments;
      const hasShareMismatch = post.shares_count !== realShares;

      if (hasLikeMismatch || hasCommentMismatch || hasShareMismatch) {
        totalMismatches++;

        if (hasLikeMismatch) postCounterMismatchTotal.inc({ counter_type: 'likes' });
        if (hasCommentMismatch) postCounterMismatchTotal.inc({ counter_type: 'comments' });
        if (hasShareMismatch) postCounterMismatchTotal.inc({ counter_type: 'shares' });

        if (!DRY_RUN) {
          try {
            await sequelize.query(
              `UPDATE posts
               SET likes_count = ?, comments_count = ?, shares_count = ?
               WHERE id = ?`,
              { replacements: [realLikes, realComments, realShares, post.id] },
            );
            totalRepaired++;
            if (hasLikeMismatch) postCounterRepairTotal.inc({ counter_type: 'likes' });
            if (hasCommentMismatch) postCounterRepairTotal.inc({ counter_type: 'comments' });
            if (hasShareMismatch) postCounterRepairTotal.inc({ counter_type: 'shares' });
          } catch (err) {
            logger.error('RECONCILE', 'repair_failed', { postId: post.id, error: err.message });
          }
        }
      }
    }

    offset += BATCH_SIZE;
  }

  postCounterReconciliationTotal.inc();
  const durationMs = Date.now() - startTime;
  logger.info('RECONCILE', 'reconciliation_completed', {
    durationMs,
    batches: batchCount,
    mismatches: totalMismatches,
    repaired: totalRepaired,
    dryRun: DRY_RUN,
  });

  return { totalMismatches, totalRepaired, durationMs };
};


export const reconcileEventCounters = async () => {
  logger.info('RECONCILE', 'event_reconciliation_started', { dryRun: DRY_RUN });
  let mismatches = 0;
  let repaired = 0;

  try {
    const [events] = await sequelize.query(`
      SELECT e.id, e.going_count, e.interested_count, e.declined_count,
        (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.status = 'going' AND p.is_deleted = 0 AND p.is_active = 1) AS actual_going,
        (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.status = 'interested' AND p.is_deleted = 0 AND p.is_active = 1) AS actual_interested,
        (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.status = 'declined' AND p.is_deleted = 0 AND p.is_active = 1) AS actual_declined
      FROM events e
      WHERE e.is_deleted = 0
    `);

    for (const ev of events) {
      const storedGoing = Math.max(0, Number(ev.going_count || 0));
      const actualGoing = Math.max(0, Number(ev.actual_going || 0));
      const storedInterested = Math.max(0, Number(ev.interested_count || 0));
      const actualInterested = Math.max(0, Number(ev.actual_interested || 0));
      const storedDeclined = Math.max(0, Number(ev.declined_count || 0));
      const actualDeclined = Math.max(0, Number(ev.actual_declined || 0));

      if (storedGoing !== actualGoing || storedInterested !== actualInterested || storedDeclined !== actualDeclined) {
        mismatches++;
        if (!DRY_RUN) {
          await sequelize.query(
            'UPDATE events SET going_count = ?, interested_count = ?, declined_count = ? WHERE id = ?',
            { replacements: [actualGoing, actualInterested, actualDeclined, ev.id] },
          );
          repaired++;
        }
      }
    }
  } catch (error) {
    logger.error('RECONCILE', 'event_reconciliation_failed', { error: error.message });
  }

  logger.info('RECONCILE', 'event_reconciliation_completed', { mismatches, repaired });
  return { mismatches, repaired };
};

export const runFullReconciliation = async () => {
  const posts = await reconcilePostCounters();
  const communities = await reconcileCommunityCounters();
  const events = await reconcileEventCounters();
  return { posts, communities, events };
};

if (process.argv[1]?.endsWith('counterReconciliation.worker.js')) {
  runFullReconciliation()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Reconciliation fatal error:', err);
      process.exit(1);
    });
}
