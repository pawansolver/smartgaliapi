/**
 * BullMQ / chat-events queue configuration (env-driven).
 *
 * Namespaces:
 *  - App cache / idempotency: REDIS_KEY_PREFIX (default smartgali:)
 *  - BullMQ: QUEUE_PREFIX (default smartgali:bull)
 * These must stay separate so keys do not collide.
 */

const toInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export const queueConfig = {
  prefix: process.env.QUEUE_PREFIX || 'smartgali:bull',
  chatQueueName: process.env.CHAT_QUEUE_NAME || 'chat-events',
  workerConcurrency: toInt(process.env.CHAT_WORKER_CONCURRENCY, 10),
  jobAttempts: toInt(process.env.CHAT_JOB_ATTEMPTS, 5),
  /** Base delay (ms) for exponential backoff: delay * 2^attempt */
  jobBackoffMs: toInt(process.env.CHAT_JOB_BACKOFF, 2000),
  /** How many pending outbox rows to claim per recovery sweep */
  publisherBatchSize: toInt(process.env.OUTBOX_PUBLISH_BATCH, 50),
};

export const CHAT_JOB_NAME = 'outbox.process';

/**
 * Deterministic BullMQ job id for an outbox event.
 * Same event → same job id → no accidental duplicate jobs.
 */
export const buildOutboxJobId = (outboxEventId) => `outbox-event-${outboxEventId}`;

export const defaultJobOptions = {
  attempts: queueConfig.jobAttempts,
  backoff: {
    type: 'exponential',
    delay: queueConfig.jobBackoffMs,
  },
  removeOnComplete: {
    age: 24 * 3600,
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 3600,
  },
};

export default queueConfig;
