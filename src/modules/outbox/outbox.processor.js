import Message from '../message/message.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import { broadcastMessage, getIO } from '../../socket.js';
import { logger } from '../../utils/logger.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_STATUS } from './outbox.events.js';
import OutboxEvent from './outbox_event.model.js';
import * as outboxService from './outbox.service.js';
import { handleMessageCreatedPush } from '../../workers/notification.handler.js';

const MESSAGE_INCLUDES = [
  {
    model: User,
    as: 'sender',
    attributes: ['userId', 'userName'],
    include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl'] }],
  },
  {
    model: Message,
    as: 'repliedMessage',
    attributes: ['id', 'message', 'message_type', 'sender_id', 'media_url'],
  },
];

/** Mutable for tests — avoid real FCM in unit suite. */
export const processorDeps = {
  handleMessageCreatedPush: (args) => handleMessageCreatedPush(args),
};

/**
 * Handler: message.created → Socket.IO broadcast + FCM for offline recipients.
 * Does NOT run inside a DB transaction. Failures leave the outbox event
 * in failed/pending state for Phase 4 retry.
 */
const handleMessageCreated = async (event, { message: preloaded, io: injectedIo } = {}) => {
  const payload = event.payload || {};
  const chatId = payload.chatId ?? payload.chat_id;
  const messageId = payload.messageId ?? payload.message_id;
  const senderId = payload.senderId ?? payload.sender_id;

  let message = preloaded;
  if (!message) {
    if (!messageId) {
      throw new Error('message.created payload missing messageId');
    }
    message = await Message.findByPk(messageId, { include: MESSAGE_INCLUDES });
    if (!message) {
      throw new Error(`Message ${messageId} not found for outbox event ${event.id}`);
    }
  }

  // Injected io supports tests; production uses getIO().
  const io = injectedIo ?? getIO();
  const resolvedChatId = chatId ?? message.chat_id;
  broadcastMessage(io, resolvedChatId, message);

  // FCM after Socket.IO — never inside the message write transaction
  await processorDeps.handleMessageCreatedPush({
    chatId: resolvedChatId,
    messageId: messageId ?? message.id,
    senderId: senderId ?? message.sender_id,
    message,
  });
};

const handlers = {
  [OUTBOX_EVENT_TYPES.MESSAGE_CREATED]: handleMessageCreated,
};

/**
 * Process a single outbox event: mark processing → route handler → mark published/failed.
 *
 * Designed for at-least-once delivery: already-published events are skipped
 * (idempotent). Safe for BullMQ retries after crash mid-flight.
 *
 * @param {object} event - OutboxEvent instance or plain object with id/event_type/payload
 * @param {object} [context] - Optional { message, io }
 */
export const processEvent = async (event, context = {}) => {
  if (!event?.id) {
    logger.warn('OUTBOX', 'invalid_event', { reason: 'missing_id' });
    return { ok: false, reason: 'invalid_event' };
  }

  // Reload authoritative status for race-safe idempotency across workers
  const fresh = await OutboxEvent.findByPk(event.id);
  if (!fresh) {
    logger.warn('OUTBOX', 'invalid_event', {
      eventId: event.id,
      reason: 'not_found',
    });
    return { ok: false, reason: 'not_found' };
  }

  if (fresh.status === OUTBOX_STATUS.PUBLISHED) {
    return { ok: true, reason: 'already_published' };
  }

  const eventType = fresh.event_type;
  const handler = handlers[eventType];

  if (!handler) {
    logger.warn('OUTBOX', 'invalid_event', {
      eventId: fresh.id,
      eventType,
      reason: 'unknown_event_type',
    });
    await outboxService.markFailed(fresh.id, `Unknown event_type: ${eventType}`);
    return { ok: false, reason: 'unknown_event_type' };
  }

  try {
    await outboxService.markProcessing(fresh.id);
    await handler(fresh, context);
    await outboxService.markPublished(fresh.id);
    return { ok: true };
  } catch (error) {
    // Do not log payload contents (may grow; keep IDs only)
    logger.error('OUTBOX', 'outbox_event_processing_failure', {
      eventId: fresh.id,
      eventType,
      error: error.message,
    });
    await outboxService.markFailed(fresh.id, error).catch((markErr) => {
      logger.error('OUTBOX', 'outbox_mark_failed_error', {
        eventId: fresh.id,
        error: markErr.message,
      });
    });
    return { ok: false, reason: 'processing_failed', error: error.message };
  }
};

export default { processEvent };
