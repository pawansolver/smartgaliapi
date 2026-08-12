/**
 * SmartGali Chat Events Worker Process
 * ─────────────────────────────────────────────────────────────────────────────
 * Run separately from the HTTP API:
 *
 *   npm run worker
 *
 * Connects to the same MySQL + Redis as the API. Processes BullMQ jobs from
 * the chat-events queue and emits Socket.IO events via the Redis adapter.
 *
 * Local development:
 *   Terminal 1: npm run dev
 *   Terminal 2: npm run worker
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { connectDB } from '../config/db.js';
import {
  createRedisClients,
  closeRedisClients,
  getIsRedisAvailable,
} from '../config/redis.js';
import { initSocketEmitter } from '../socket.js';
import Redis from 'ioredis';
import { closeQueueInfrastructure } from '../infrastructure/queues/index.js';
import {
  startChatEventsWorker,
  stopChatEventsWorker,
} from './chatEvents.worker.js';
import { initFcm, fcmConfig } from '../infrastructure/notifications/index.js';

// Register models before DB sync / queries
import '../modules/message_receipt/message_receipt.model.js';
import '../modules/message_reaction/message_reaction.model.js';
import '../modules/message_deletion/message_deletion.model.js';
import '../modules/audit_log/audit_log.model.js';
import '../modules/outbox/outbox_event.model.js';
import '../modules/user_devices/user_device.model.js';

let io = null;
let shuttingDown = false;

/** Fail fast if Redis (required for BullMQ) is unreachable. */
const assertBullRedisReachable = async () => {
  const redisUrl = process.env.REDIS_URL || null;
  const probe = redisUrl
    ? new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      retryStrategy: () => null,
    })
    : new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB) || 0,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      retryStrategy: () => null,
    });

  try {
    await probe.connect();
    await probe.ping();
  } finally {
    try {
      await probe.quit();
    } catch {
      probe.disconnect();
    }
  }
};

const start = async () => {
  await connectDB();
  await createRedisClients();

  if (!getIsRedisAvailable()) {
    console.warn('⚠️  App Redis clients unavailable — Socket.IO adapter will not fan out.');
  }

  try {
    await assertBullRedisReachable();
  } catch (error) {
    throw new Error(
      `BullMQ requires Redis. Start Redis locally or set REDIS_URL. (${error.message})`,
    );
  }

  // Emitter-only Socket.IO (Redis adapter fans out to API instances)
  io = initSocketEmitter();

  if (fcmConfig.enabled) {
    initFcm();
    console.log('📲 FCM initialized for push notifications');
  } else {
    console.log('📲 FCM disabled (FCM_ENABLED=false) — Socket.IO only');
  }

  await startChatEventsWorker();
  console.log('👷 Chat events worker is running');
};

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; stopping worker...`);

  const forceExit = setTimeout(() => process.exit(1), 15000);
  forceExit.unref();

  try {
    // Stop accepting new jobs; finish in-flight work
    await stopChatEventsWorker();
    if (io) {
      await new Promise((resolve) => io.close(resolve));
      io = null;
    }
    await closeQueueInfrastructure();
    await closeRedisClients();
    process.exitCode = 0;
  } catch (error) {
    console.error('Worker shutdown failed:', error);
    process.exitCode = 1;
  } finally {
    clearTimeout(forceExit);
    process.exit(process.exitCode ?? 0);
  }
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

start().catch((error) => {
  console.error('❌ Failed to start worker:', error);
  process.exit(1);
});
