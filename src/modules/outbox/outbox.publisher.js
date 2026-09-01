import { logger } from '../../utils/logger.js';
import * as queues from '../../infrastructure/queues/index.js';
import OutboxEvent from './outbox_event.model.js';
import { OUTBOX_STATUS } from './outbox.events.js';
import * as outboxService from './outbox.service.js';

/**
 * Mutable deps for unit tests (ESM named exports cannot be reassigned by mock.method).
 */
export const publisherDeps = {
  enqueueOutboxJob: (...args) => queues.enqueueOutboxJob(...args),
  getPendingEvents: (...args) => outboxService.getPendingEvents(...args),
  getPublisherBatchSize: () => queues.queueConfig.publisherBatchSize,
};

/**
 * Outbox → BullMQ publisher.
 *
 * Safety rules (DB and Redis are not in one ACID TX):
 *  1. Never mark outbox published before BullMQ.add succeeds.
 *  2. Leave status as pending after enqueue; the worker marks processing/published.
 *  3. Prefer duplicate processing over lost events (deterministic job IDs).
 *  4. If enqueue fails, the event stays pending for recovery sweeps.
 */

/**
 * Publish a single outbox event to BullMQ (post-commit only).
 *
 * @param {object} outboxEvent - OutboxEvent instance or { id, event_type }
 */
export const publishOutboxEvent = async (outboxEvent) => {
  if (!outboxEvent?.id) {
    logger.warn('OUTBOX', 'publish_skipped', { reason: 'missing_id' });
    return { ok: false, reason: 'missing_id' };
  }

  // Already finished — nothing to enqueue
  if (outboxEvent.status === OUTBOX_STATUS.PUBLISHED) {
    return { ok: true, reason: 'already_published' };
  }

  try {
    const { jobId, duplicated } = await publisherDeps.enqueueOutboxJob({
      outboxEventId: outboxEvent.id,
      eventType: outboxEvent.event_type,
    });

    logger.info('OUTBOX', 'outbox_enqueued', {
      eventId: outboxEvent.id,
      eventType: outboxEvent.event_type,
      jobId,
      duplicated,
    });

    return { ok: true, jobId, duplicated };
  } catch (error) {
    // Do NOT mark published. Keep pending so recovery can retry.
    logger.error('OUTBOX', 'outbox_enqueue_failed', {
      eventId: outboxEvent.id,
      eventType: outboxEvent.event_type,
      error: error.message,
    });
    return { ok: false, reason: 'enqueue_failed', error: error.message };
  }
};

/**
 * Recover pending outbox events (startup / sweep).
 * Safe to call repeatedly — job IDs dedupe in BullMQ.
 */
export const publishPendingEvents = async ({
  limit = publisherDeps.getPublisherBatchSize(),
} = {}) => {
  const pending = await publisherDeps.getPendingEvents({ limit });
  const results = [];

  for (const event of pending) {
    results.push(await publishOutboxEvent(event));
  }

  logger.info('OUTBOX', 'pending_publish_sweep', {
    found: pending.length,
    enqueued: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });

  return results;
};

/**
 * Load an outbox event by id (worker helper).
 */
export const loadOutboxEvent = async (outboxEventId) => {
  return OutboxEvent.findByPk(outboxEventId);
};

export default {
  publishOutboxEvent,
  publishPendingEvents,
  loadOutboxEvent,
  publisherDeps,
};
