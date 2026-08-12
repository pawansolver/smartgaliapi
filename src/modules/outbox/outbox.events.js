/**
 * Outbox event type / status constants.
 * Only event types needed by the current chat send path are defined here.
 */

export const OUTBOX_EVENT_TYPES = {
  MESSAGE_CREATED: 'message.created',
};

export const OUTBOX_AGGREGATE_TYPES = {
  MESSAGE: 'message',
  CHAT: 'chat',
};

export const OUTBOX_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PUBLISHED: 'published',
  FAILED: 'failed',
};

export const OUTBOX_STATUS_VALUES = Object.values(OUTBOX_STATUS);
