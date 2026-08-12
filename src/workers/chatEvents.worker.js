import { Worker } from 'bullmq';
import { logger } from '../utils/logger.js';
import {
  queueConfig,
  CHAT_JOB_NAME,
  createBullConnection,
} from '../infrastructure/queues/index.js';
import * as outboxProcessor from '../modules/outbox/outbox.processor.js';
import * as outboxPublisher from '../modules/outbox/outbox.publisher.js';
import * as outboxService from '../modules/outbox/outbox.service.js';
import { OUTBOX_STATUS } from '../modules/outbox/outbox.events.js';

/** Mutable deps for unit tests (ESM exports are not mockable via mock.method). */
export const workerDeps = {
  loadOutboxEvent: (id) => outboxPublisher.loadOutboxEvent(id),
  processEvent: (event, ctx) => outboxProcessor.processEvent(event, ctx),
  publishPendingEvents: (...args) => outboxPublisher.publishPendingEvents(...args),
  markFailed: (...args) => outboxService.markFailed(...args),
};

let worker = null;
let workerConnection = null;

/**
 * Process one BullMQ job: load OutboxEvent → processEvent → Socket.IO.
 * Throws on retriable failures so BullMQ exponential backoff applies.
 */
export const handleChatEventJob = async (job) => {
  const { outboxEventId, eventType } = job.data || {};

  if (!outboxEventId) {
    logger.warn('WORKER', 'invalid_job', { jobId: job.id, reason: 'missing_outboxEventId' });
    return { ok: false, reason: 'invalid_job' };
  }

  logger.info('WORKER', 'job_start', {
    jobId: job.id,
    outboxEventId,
    eventType,
    attempt: job.attemptsMade + 1,
  });

  const event = await workerDeps.loadOutboxEvent(outboxEventId);
  if (!event) {
    // Permanent — do not retry forever for missing rows
    logger.warn('WORKER', 'outbox_event_missing', { outboxEventId, jobId: job.id });
    return { ok: false, reason: 'not_found' };
  }

  if (event.status === OUTBOX_STATUS.PUBLISHED) {
    logger.info('WORKER', 'job_skipped_already_published', {
      jobId: job.id,
      outboxEventId,
    });
    return { ok: true, reason: 'already_published' };
  }

  const result = await workerDeps.processEvent(event);

  if (result.ok) {
    logger.info('WORKER', 'job_completed', {
      jobId: job.id,
      outboxEventId,
      reason: result.reason || 'published',
    });
    return result;
  }

  // Unknown event types are permanent failures (already marked failed in processor)
  if (result.reason === 'unknown_event_type' || result.reason === 'not_found' || result.reason === 'invalid_event') {
    return result;
  }

  // Retriable — rethrow so BullMQ schedules the next attempt
  throw new Error(result.error || `Outbox processing failed for event ${outboxEventId}`);
};

/**
 * Start the chat-events BullMQ worker (separate process from HTTP API).
 */
export const startChatEventsWorker = async () => {
  if (worker) return worker;

  workerConnection = createBullConnection('bullmq-worker');

  worker = new Worker(
    queueConfig.chatQueueName,
    async (job) => handleChatEventJob(job),
    {
      connection: workerConnection,
      prefix: queueConfig.prefix,
      concurrency: queueConfig.workerConcurrency,
    },
  );

  worker.on('failed', async (job, err) => {
    const outboxEventId = job?.data?.outboxEventId;
    const permanent = job && job.attemptsMade >= (job.opts?.attempts || queueConfig.jobAttempts);

    logger.error('WORKER', 'job_failed', {
      jobId: job?.id,
      outboxEventId,
      attemptsMade: job?.attemptsMade,
      permanent,
      error: err?.message,
    });

    // Ensure outbox retains failure metadata after final attempt
    if (permanent && outboxEventId) {
      await workerDeps.markFailed(outboxEventId, err).catch((markErr) => {
        logger.error('WORKER', 'outbox_mark_failed_error', {
          outboxEventId,
          error: markErr.message,
        });
      });
    }
  });

  worker.on('error', (err) => {
    logger.error('WORKER', 'worker_error', { error: err.message });
  });

  worker.on('completed', (job) => {
    logger.debug('WORKER', 'job_completed_event', {
      jobId: job.id,
      outboxEventId: job.data?.outboxEventId,
    });
  });

  // Recover any pending outbox rows left after crashes (deduped by jobId)
  await workerDeps.publishPendingEvents().catch((err) => {
    logger.error('WORKER', 'pending_sweep_failed', { error: err.message });
  });

  logger.info('WORKER', 'chat_events_worker_started', {
    queue: queueConfig.chatQueueName,
    concurrency: queueConfig.workerConcurrency,
    attempts: queueConfig.jobAttempts,
  });

  return worker;
};

/**
 * Graceful worker shutdown: stop new jobs, wait for active, close connections.
 */
export const stopChatEventsWorker = async () => {
  if (!worker) return;
  const w = worker;
  worker = null;
  await w.close();
  if (workerConnection) {
    const conn = workerConnection;
    workerConnection = null;
    try {
      await conn.quit();
    } catch {
      conn.disconnect();
    }
  }
  logger.info('WORKER', 'chat_events_worker_stopped');
};

export default {
  startChatEventsWorker,
  stopChatEventsWorker,
  handleChatEventJob,
};
