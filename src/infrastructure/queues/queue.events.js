/**
 * Logical queue / job event names for chat outbox processing.
 */

export const QUEUE_NAMES = {
  CHAT_EVENTS: 'chat-events',
};

export const JOB_NAMES = {
  OUTBOX_PROCESS: 'outbox.process',
};

export default { QUEUE_NAMES, JOB_NAMES };
