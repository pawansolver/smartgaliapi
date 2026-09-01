/**
 * Feed Analytics Worker - Phase 10
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Processes BATCH_VIEWS_PROCESS jobs from the feed-analytics BullMQ queue.
 *
 * Per-job processing:
 *   1. Dedup per {userId}:{postId}:{hourBucket} using Redis SETNX
 *   2. Bulk INSERT new views using parameterized query (SQL injection safe)
 *   3. Retry 3x with exponential backoff on DB failure
 *
 * Never runs inside an HTTP request cycle.
 */

import { Worker } from 'bullmq';
import { getSharedBullConnection } from '../infrastructure/queues/queue.connection.js';
import { queueConfig } from '../infrastructure/queues/queue.config.js';
import sequelize from '../config/db.js';
import { cacheClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import {
  batchViewsProcessingDuration,
  bullmqJobsTotal,
  bullmqJobFailures,
} from '../monitoring/metrics.js';

const DEDUP_TTL = 3600; // 1 hour in seconds

let feedAnalyticsWorker = null;

/**
 * Get the Redis client for dedup (uses existing cache client).
 */
const getRedisForDedup = () => {
  try {
    // Access the module-level cacheClient (may be null if Redis is down)
    const { cacheClient: client } = require('../config/redis.js');
    return client;
  } catch {
    return null;
  }
};

/**
 * Check Redis dedup and return only views not seen in the last hour.
 * Falls back to allowing all views if Redis is unavailable.
 */
const filterDedupViews = async (viewerId, views) => {
  // Try to get a Redis client
  let redis = null;
  try {
    const redisModule = await import('../config/redis.js');
    redis = redisModule.cacheClient || null;
  } catch {
    redis = null;
  }

  if (!redis) {
    // Redis unavailable - allow all (DB UNIQUE/timing dedup is secondary protection)
    return views;
  }

  const hourBucket = Math.floor(Date.now() / (1000 * 3600));
  const newViews = [];
  const pipeline = redis.pipeline();

  for (const view of views) {
    const key = `vdedup:${viewerId}:${view.postId}:${hourBucket}`;
    pipeline.set(key, '1', 'EX', DEDUP_TTL, 'NX'); // SET if Not eXists
  }

  const results = await pipeline.exec();
  for (let i = 0; i < views.length; i++) {
    const [err, result] = results[i];
    if (!err && result === 'OK') {
      // Successfully set = new view (not a duplicate)
      newViews.push(views[i]);
    }
  }
  return newViews;
};

/**
 * Process a single batch-views job.
 */
const processBatchViewsJob = async (job) => {
  const end = batchViewsProcessingDuration.startTimer();
  try {
    const { viewerId, views } = job.data;

    if (!Array.isArray(views) || views.length === 0) return { recorded: 0 };

    // Dedup using Redis
    const dedupedViews = await filterDedupViews(viewerId, views);

    if (dedupedViews.length === 0) {
      logger.info('FEED_ANALYTICS', 'all_views_deduplicated', {
        jobId: job.id,
        viewerId,
        originalCount: views.length,
      });
      return { recorded: 0 };
    }

    // Bulk INSERT using parameterized query (NOT string concat - SQL injection safe)
    const placeholders = dedupedViews.map(() => '(?, ?, NOW(), ?)').join(', ');
    const replacements = dedupedViews.flatMap((v) => [v.postId, viewerId, v.dwellMs]);

    await sequelize.query(
      `INSERT INTO post_views (post_id, user_id, viewed_at, dwell_time_ms) VALUES ${placeholders}`,
      { replacements },
    );

    bullmqJobsTotal.inc({ queue: 'feed-analytics', status: 'completed' });
    logger.info('FEED_ANALYTICS', 'batch_views_processed', {
      jobId: job.id,
      viewerId,
      recorded: dedupedViews.length,
      deduplicated: views.length - dedupedViews.length,
    });

    return { recorded: dedupedViews.length };
  } finally {
    end();
  }
};

export const startFeedAnalyticsWorker = () => {
  if (feedAnalyticsWorker) return feedAnalyticsWorker;

  feedAnalyticsWorker = new Worker(
    'feed-analytics',
    processBatchViewsJob,
    {
      connection: getSharedBullConnection(),
      prefix: queueConfig.prefix,
      concurrency: 5,
    },
  );

  feedAnalyticsWorker.on('failed', (job, err) => {
    bullmqJobFailures.inc({ queue: 'feed-analytics' });
    logger.error('FEED_ANALYTICS', 'job_failed', {
      jobId: job?.id,
      error: err.message,
      attempts: job?.attemptsMade,
    });
  });

  feedAnalyticsWorker.on('error', (err) => {
    logger.error('FEED_ANALYTICS', 'worker_error', { error: err.message });
  });

  logger.info('FEED_ANALYTICS', 'worker_started', {});
  return feedAnalyticsWorker;
};

export const stopFeedAnalyticsWorker = async () => {
  if (!feedAnalyticsWorker) return;
  const w = feedAnalyticsWorker;
  feedAnalyticsWorker = null;
  await w.close();
};

export default { startFeedAnalyticsWorker, stopFeedAnalyticsWorker };
