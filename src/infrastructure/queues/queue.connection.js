import Redis from 'ioredis';
import { logger } from '../../utils/logger.js';

/**
 * Dedicated BullMQ Redis connections.
 *
 * BullMQ requires:
 *  - maxRetriesPerRequest: null (blocking commands)
 *  - NO ioredis keyPrefix (BullMQ uses its own prefix option)
 *
 * Reuses the same REDIS_* host/url/password as the app Redis config so we do
 * not invent a second unrelated Redis deployment — only a separate connection
 * with BullMQ-compatible options.
 */

const REDIS_URL = process.env.REDIS_URL || null;
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASS = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB = Number(process.env.REDIS_DB) || 0;

const buildBullOptions = () => ({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASS,
  db: REDIS_DB,
  // Critical for BullMQ workers (blocking BRPOP / etc.)
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

let sharedConnection = null;
const trackedConnections = new Set();

const attachErrorHandler = (client, label) => {
  client.on('error', (err) => {
    logger.error('QUEUE', 'redis_connection_error', {
      label,
      error: err.message,
    });
  });
  trackedConnections.add(client);
  return client;
};

/**
 * Create a new ioredis connection suitable for BullMQ Queue/Worker/QueueEvents.
 */
export const createBullConnection = (label = 'bullmq') => {
  const options = buildBullOptions();
  const client = REDIS_URL
    ? new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true })
    : new Redis(options);
  return attachErrorHandler(client, label);
};

/**
 * Shared connection for Queue producers (API process).
 * Workers should use duplicate connections via createBullConnection().
 */
export const getSharedBullConnection = () => {
  if (!sharedConnection) {
    sharedConnection = createBullConnection('bullmq-shared');
  }
  return sharedConnection;
};

export const closeBullConnections = async () => {
  const clients = [...trackedConnections];
  trackedConnections.clear();
  sharedConnection = null;
  await Promise.allSettled(clients.map(async (client) => {
    try {
      if (client.status !== 'end') await client.quit();
    } catch {
      client.disconnect();
    }
  }));
};

export default {
  createBullConnection,
  getSharedBullConnection,
  closeBullConnections,
};
