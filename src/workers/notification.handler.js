/**
 * Notification side-effects for chat-events worker (same BullMQ process).
 * Separated for clarity / unit testing — not a second worker framework.
 */

import { dispatchChatMessagePush } from '../infrastructure/notifications/chatPush.dispatcher.js';
import { logger } from '../utils/logger.js';

/** Mutable for tests. */
export const notificationHandlerDeps = {
  dispatchChatMessagePush: (args) => dispatchChatMessagePush(args),
};

/**
 * Handle FCM push for a processed message.created outbox event.
 * Errors that are retriable are rethrown so BullMQ retries the job.
 */
export const handleMessageCreatedPush = async ({
  chatId,
  messageId,
  senderId,
  message,
}) => {
  try {
    return await notificationHandlerDeps.dispatchChatMessagePush({
      chatId,
      messageId,
      senderId,
      message,
    });
  } catch (error) {
    if (error.retriable) throw error;
    // Non-retriable FCM issues must not block Socket.IO publish forever
    logger.warn('FCM', 'push_handler_swallowed', {
      chatId,
      messageId,
      error: error.message,
    });
    return { ok: false, error: error.message };
  }
};

export default { handleMessageCreatedPush };
