import { Op } from 'sequelize';
import OutboxEvent from './outbox_event.model.js';
import { OUTBOX_STATUS } from './outbox.events.js';

/**
 * Create a single outbox event (optionally inside an existing transaction).
 */
export const createEvent = async (eventData, options = {}) => {
  const {
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    status = OUTBOX_STATUS.PENDING,
    available_at = new Date(),
  } = eventData;

  return OutboxEvent.create({
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    status,
    attempts: 0,
    available_at,
    processed_at: null,
    last_error: null,
  }, options);
};

/**
 * Bulk-create outbox events (optionally inside an existing transaction).
 */
export const createEvents = async (events, options = {}) => {
  if (!events?.length) return [];
  return OutboxEvent.bulkCreate(
    events.map((e) => ({
      event_type: e.event_type,
      aggregate_type: e.aggregate_type,
      aggregate_id: e.aggregate_id,
      payload: e.payload,
      status: e.status ?? OUTBOX_STATUS.PENDING,
      attempts: 0,
      available_at: e.available_at ?? new Date(),
      processed_at: null,
      last_error: null,
    })),
    options,
  );
};

/**
 * Fetch pending events ready for processing (for Phase 4 worker).
 */
export const getPendingEvents = async ({ limit = 50, now = new Date() } = {}) => {
  return OutboxEvent.findAll({
    where: {
      status: OUTBOX_STATUS.PENDING,
      available_at: { [Op.lte]: now },
    },
    order: [['available_at', 'ASC'], ['id', 'ASC']],
    limit,
  });
};

/**
 * Mark event as processing and increment attempts.
 */
export const markProcessing = async (eventId, options = {}) => {
  const event = await OutboxEvent.findByPk(eventId, options);
  if (!event) return null;

  event.status = OUTBOX_STATUS.PROCESSING;
  event.attempts = (event.attempts || 0) + 1;
  event.last_error = null;
  await event.save(options);
  return event;
};

/**
 * Mark event as successfully published.
 */
export const markPublished = async (eventId, options = {}) => {
  const event = await OutboxEvent.findByPk(eventId, options);
  if (!event) return null;

  event.status = OUTBOX_STATUS.PUBLISHED;
  event.processed_at = new Date();
  event.last_error = null;
  await event.save(options);
  return event;
};

/**
 * Mark event as failed; optionally schedule retry via available_at.
 */
export const markFailed = async (eventId, error, { availableAt } = {}, options = {}) => {
  const event = await OutboxEvent.findByPk(eventId, options);
  if (!event) return null;

  const message = typeof error === 'string'
    ? error
    : (error?.message || 'Unknown outbox processing error');

  event.status = OUTBOX_STATUS.FAILED;
  event.last_error = message.slice(0, 2000);
  if (availableAt) {
    event.available_at = availableAt;
    // Ready for Phase 4 retry: failed + available_at in the future/past
    // Worker may reset status to pending; for now leave as failed with metadata.
  }
  await event.save(options);
  return event;
};

export default {
  createEvent,
  createEvents,
  getPendingEvents,
  markProcessing,
  markPublished,
  markFailed,
};
