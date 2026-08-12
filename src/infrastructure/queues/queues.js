import { Queue } from 'bullmq';
import { logger } from '../../utils/logger.js';
import {
  queueConfig,
  defaultJobOptions,
  buildOutboxJobId,
  CHAT_JOB_NAME,
} from './queue.config.js';
import { getSharedBullConnection } from './queue.connection.js';

let chatEventsQueue = null;

/**
 * Lazily create the chat-events Queue (producer side).
 */
export const getChatEventsQueue = () => {
  if (!chatEventsQueue) {
    chatEventsQueue = new Queue(queueConfig.chatQueueName, {
      connection: getSharedBullConnection(),
      prefix: queueConfig.prefix,
      defaultJobOptions,
    });
    chatEventsQueue.on('error', (err) => {
      logger.error('QUEUE', 'chat_events_queue_error', { error: err.message });
    });
  }
  return chatEventsQueue;
};

/**
 * Enqueue an outbox event for async processing.
 * Uses deterministic jobId for deduplication.
 *
 * @returns {{ job, jobId, duplicated: boolean }}
 */
export const enqueueOutboxJob = async ({ outboxEventId, eventType }) => {
  const queue = getChatEventsQueue();
  const jobId = buildOutboxJobId(outboxEventId);

  try {
    const job = await queue.add(
      CHAT_JOB_NAME,
      { outboxEventId, eventType },
      { jobId, ...defaultJobOptions },
    );
    return { job, jobId, duplicated: false };
  } catch (error) {
    // BullMQ rejects duplicate jobIds — treat as already enqueued (safe).
    const msg = error?.message || '';
    if (
      msg.includes('already exists')
      || msg.includes('JobId')
      || error?.name === 'JobIdAlreadyExistsError'
    ) {
      logger.info('QUEUE', 'outbox_job_already_exists', {
        jobId,
        outboxEventId,
      });
      return { job: null, jobId, duplicated: true };
    }
    throw error;
  }
};

/**
 * Lightweight internal queue health (not a public admin API).
 */
export const getChatQueueHealth = async () => {
  const queue = getChatEventsQueue();
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
    'paused',
  );
  return {
    queue: queueConfig.chatQueueName,
    prefix: queueConfig.prefix,
    counts,
  };
};

export const closeChatEventsQueue = async () => {
  if (!chatEventsQueue) return;
  const q = chatEventsQueue;
  chatEventsQueue = null;
  await q.close();
};

export default {
  getChatEventsQueue,
  enqueueOutboxJob,
  getChatQueueHealth,
  closeChatEventsQueue,
  buildOutboxJobId,
};
