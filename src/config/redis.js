import Redis from 'ioredis';
import { setCacheClientRef, trackRedis } from '../monitoring/redisMetrics.js';
import env from './env.js';

/**
 * Redis Configuration
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Uses ioredis which supports:
 *  - Automatic reconnection
 *  - Sentinel / Cluster mode (configure via REDIS_URL or REDIS_CLUSTER_NODES)
 *  - Lazy connect (won't crash app if Redis is unavailable)
 *
 * In development, if Redis is not configured the system falls back gracefully
 * using a "null adapter" so Socket.IO still works on a single instance.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

const REDIS_URL  = process.env.REDIS_URL || null;
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASS = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB   = Number(process.env.REDIS_DB) || 0;
const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'smartgali:';

const redisOptions = {
  host:             REDIS_HOST,
  port:             REDIS_PORT,
  password:         REDIS_PASS,
  db:               REDIS_DB,
  keyPrefix:        REDIS_KEY_PREFIX,
  lazyConnect:      true,   // Don't auto-connect; let us handle it
  retryStrategy: (times) => {
    if (times > 10) {
      console.warn('âš ï¸  Redis: max reconnect attempts reached. Running without Redis.');
      return null; // Stop retrying
    }
    return Math.min(times * 200, 3000); // exponential back-off
  },
  enableOfflineQueue:       false,
  enableReadyCheck:         true,
  maxRetriesPerRequest:     3,
  connectTimeout:           Number(process.env.REDIS_CONNECT_TIMEOUT_MS) || 2000,
};

// â”€â”€ Create two clients (pub + sub) needed by @socket.io/redis-adapter â”€â”€â”€â”€â”€â”€â”€â”€
let pubClient  = null;
let subClient  = null;
let cacheClient = null;
let isRedisAvailable = false;

export const createRedisClients = async () => {
  if (pubClient || subClient || cacheClient) {
    return { pubClient, subClient, cacheClient, isRedisAvailable };
  }
  try {
    pubClient = REDIS_URL
      ? new Redis(REDIS_URL, redisOptions)
      : new Redis(redisOptions);
    subClient   = pubClient.duplicate();
    cacheClient = pubClient.duplicate();

    for (const [name, client] of [['pubClient', pubClient], ['subClient', subClient], ['cacheClient', cacheClient]]) {
      client.on('error', (err) => console.error(`Redis ${name} error:`, err.message));
    }

    // All adapter/cache clients must be connected before Socket.IO uses them.
    await Promise.all([pubClient.connect(), subClient.connect(), cacheClient.connect()]);
    await pubClient.ping();
    isRedisAvailable = true;

    console.log('âœ… Redis connected successfully.');

  } catch (err) {
    isRedisAvailable = false;
    console.warn(`âš ï¸  Redis unavailable (${err.message}). Falling back to in-process mode. Multi-instance scaling will NOT work.`);
    await Promise.allSettled(
      [pubClient, subClient, cacheClient]
        .filter(Boolean)
        .map((client) => client.status === 'end' ? undefined : client.quit().catch(() => client.disconnect()))
    );
    pubClient   = null;
    subClient   = null;
    cacheClient = null;
  }

  return { pubClient, subClient, cacheClient, isRedisAvailable };
};

export const closeRedisClients = async () => {
  const clients = [pubClient, subClient, cacheClient].filter(Boolean);
  pubClient = null;
  subClient = null;
  cacheClient = null;
  isRedisAvailable = false;
  await Promise.allSettled(clients.map(async (client) => {
    if (client.status === 'end') return;
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }));
};

// â”€â”€ Cache helpers (safe â€” no-ops if Redis is down) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const cacheSet = async (key, value, ttlSeconds = 300) => {
  if (!cacheClient) return;
  try {
    await cacheClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch { /* swallow */ }
};

export const cacheGet = async (key) => {
  if (!cacheClient) return null;
  try {
    const raw = await cacheClient.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

export const cacheDel = async (key) => {
  if (!cacheClient) return;
  try { await cacheClient.del(key); } catch { /* swallow */ }
};

// â”€â”€ Idempotency key helpers (TTL = 24 h) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const IDEMPOTENCY_TTL = 86400; // 24 hours in seconds

export const checkIdempotencyKey = async (key) => {
  if (!cacheClient) return null;
  try {
    const val = await cacheClient.get(`idem:${key}`);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
};

export const storeIdempotencyKey = async (key, payload) => {
  if (!cacheClient) return;
  try {
    await cacheClient.set(`idem:${key}`, JSON.stringify(payload), 'EX', IDEMPOTENCY_TTL);
  } catch { /* swallow */ }
};

// â”€â”€ Rate limiter store helper (for express-rate-limit redis store) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const getRateLimitRedis = () => cacheClient;

export const getPubClient  = () => pubClient;
export const getSubClient  = () => subClient;
export const getIsRedisAvailable = () => isRedisAvailable;

export default { createRedisClients, closeRedisClients, cacheSet, cacheGet, cacheDel };

