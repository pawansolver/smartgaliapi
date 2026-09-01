export {
  queueConfig,
  buildOutboxJobId,
  defaultJobOptions,
  CHAT_JOB_NAME,
} from './queue.config.js';

export {
  createBullConnection,
  getSharedBullConnection,
  closeBullConnections,
} from './queue.connection.js';

export {
  getChatEventsQueue,
  enqueueOutboxJob,
  getChatQueueHealth,
  closeChatEventsQueue,
} from './queues.js';

export { QUEUE_NAMES, JOB_NAMES } from './queue.events.js';

import { closeChatEventsQueue } from './queues.js';
import { closeBullConnections } from './queue.connection.js';

/**
 * Close queue producers and BullMQ Redis connections (API + worker shutdown).
 */
export const closeQueueInfrastructure = async () => {
  await closeChatEventsQueue();
  await closeBullConnections();
};

export default {
  closeQueueInfrastructure,
};
