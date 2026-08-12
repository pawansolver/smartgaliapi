/**
 * Real Redis multi-instance presence validation.
 *
 * Simulates API-1 / API-2 / API-3 sharing Redis presence heartbeats and
 * cluster-wide socket counts (as Redis adapter fetchSockets would).
 *
 *   npm run test:presence:redis
 *
 * Uses external Redis or redis-memory-server (same pattern as rate-limit IT).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import {
  markUserOnline,
  handleUserSocketDisconnect,
  getOnlineFlagsForPush,
  presenceDeps,
  presenceRedisKey,
  PRESENCE_TTL_SECONDS,
} from '../../src/infrastructure/presence/presence.js';

const APP_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'smartgali:';
const TEST_PREFIX = process.env.PRESENCE_TEST_KEY_PREFIX || 'test:presence:';

let redisServer = null;
let client = null;
let redisMeta = { version: 'unknown', address: 'unavailable' };

const tryConnectExternal = async () => {
  const url = process.env.PRESENCE_TEST_REDIS_URL || process.env.REDIS_URL || null;
  const options = {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    lazyConnect: true,
    keyPrefix: APP_KEY_PREFIX,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  };
  const c = url
    ? new Redis(url, options)
    : new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.PRESENCE_TEST_REDIS_PORT || process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB || 0),
      ...options,
    });
  try {
    await c.connect();
    await c.ping();
    return c;
  } catch {
    try { await c.quit(); } catch { c.disconnect(); }
    return null;
  }
};

const tryMemoryServer = async () => {
  try {
    const mod = await import('redis-memory-server');
    const RedisMemoryServer = mod.RedisMemoryServer || mod.default;
    if (!RedisMemoryServer) return null;
    redisServer = await RedisMemoryServer.create();
    const host = await redisServer.getHost();
    const port = await redisServer.getPort();
    const c = new Redis({
      host,
      port,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      keyPrefix: APP_KEY_PREFIX,
    });
    await c.connect();
    await c.ping();
    return c;
  } catch (error) {
    console.warn('redis-memory-server unavailable:', error.message);
    if (redisServer) {
      try { await redisServer.stop(); } catch { /* ignore */ }
      redisServer = null;
    }
    return null;
  }
};

const cleanupKeys = async () => {
  if (!client) return;
  const raw = client.duplicate({ keyPrefix: '' });
  try {
    if (raw.status !== 'ready') await raw.connect().catch(() => {});
    const pattern = `${APP_KEY_PREFIX}${TEST_PREFIX}*`;
    let cursor = '0';
    do {
      const [next, keys] = await raw.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (keys.length) await raw.del(...keys);
    } while (cursor !== '0');
  } finally {
    try { await raw.quit(); } catch { raw.disconnect(); }
  }
};

test('real Redis multi-instance presence', async (t) => {
  client = await tryConnectExternal();
  if (!client) client = await tryMemoryServer();

  if (!client) {
    t.skip('Real Redis unavailable — start Redis or ensure redis-memory-server works');
    return;
  }

  const info = await client.info('server').catch(() => '');
  const versionMatch = /redis_version:([^\r\n]+)/.exec(info);
  redisMeta = {
    version: versionMatch?.[1] || 'unknown',
    address: client.options.host
      ? `${client.options.host}:${client.options.port}`
      : 'memory-server',
  };

  // Isolate test keys under test:presence: by wrapping redis key helper via cache ops
  const previous = { ...presenceDeps };
  const profileState = new Map();
  /** Simulated cluster sockets: instanceId → Set(socketId) */
  const instances = {
    'api-1': new Set(),
    'api-2': new Set(),
    'api-3': new Set(),
  };

  const namespacedKey = (userId) => `${TEST_PREFIX}${presenceRedisKey(userId)}`;

  presenceDeps.cacheGet = async (key) => {
    // presenceRedisKey returns presence:online:N — namespace for tests
    const userId = String(key).replace('presence:online:', '');
    const raw = await client.get(namespacedKey(userId));
    return raw ? JSON.parse(raw) : null;
  };
  presenceDeps.cacheSet = async (key, value, ttl = PRESENCE_TTL_SECONDS) => {
    const userId = String(key).replace('presence:online:', '');
    await client.set(namespacedKey(userId), JSON.stringify(value), 'EX', ttl);
  };
  presenceDeps.cacheDel = async (key) => {
    const userId = String(key).replace('presence:online:', '');
    await client.del(namespacedKey(userId));
  };
  presenceDeps.isRedisAvailable = () => true;
  presenceDeps.updateProfile = async (values, where) => {
    const id = Number(where.user_id);
    profileState.set(id, { ...(profileState.get(id) || {}), ...values });
    return [1];
  };
  presenceDeps.countUserSockets = async (_io, userId) => {
    // Count sockets for this user across all simulated instances
    let total = 0;
    for (const set of Object.values(instances)) {
      for (const entry of set) {
        if (entry.startsWith(`${userId}:`)) total += 1;
      }
    }
    return total;
  };

  const connect = async (instanceId, userId, socketId) => {
    instances[instanceId].add(`${userId}:${socketId}`);
    return markUserOnline(userId);
  };
  const disconnect = async (instanceId, userId, socketId) => {
    instances[instanceId].delete(`${userId}:${socketId}`);
    return handleUserSocketDisconnect({}, userId);
  };

  t.after(async () => {
    Object.assign(presenceDeps, previous);
    try { await cleanupKeys(); } catch { /* ignore */ }
    try { await client.quit(); } catch { client.disconnect(); }
    client = null;
    if (redisServer) {
      try { await redisServer.stop(); } catch { /* ignore */ }
      redisServer = null;
    }
  });

  await t.test('reports Redis metadata', () => {
    console.log(
      `Presence Redis IT: version=${redisMeta.version} address=${redisMeta.address} `
      + `ttl=${PRESENCE_TTL_SECONDS}s prefix=${APP_KEY_PREFIX}${TEST_PREFIX}`,
    );
    assert.ok(redisMeta.version);
  });

  await t.test('API-1 connect → online; API-2 connect → still online', async () => {
    await cleanupKeys();
    profileState.clear();
    for (const set of Object.values(instances)) set.clear();

    assert.equal(await connect('api-1', 100, 's1'), true);
    assert.equal(profileState.get(100)?.is_online, true);

    assert.equal(await connect('api-2', 100, 's2'), false); // already online
    assert.equal(profileState.get(100)?.is_online, true);

    const flags = await getOnlineFlagsForPush([100]);
    assert.equal(flags.get(100), true);
  });

  await t.test('API-1 disconnect while API-2 connected → remains online', async () => {
    const result = await disconnect('api-1', 100, 's1');
    assert.equal(result.offline, false);
    assert.equal(result.remaining, 1);
    assert.equal(profileState.get(100)?.is_online, true);
    const flags = await getOnlineFlagsForPush([100]);
    assert.equal(flags.get(100), true);
  });

  await t.test('last socket disconnect → offline', async () => {
    const result = await disconnect('api-2', 100, 's2');
    assert.equal(result.offline, true);
    assert.equal(profileState.get(100)?.is_online, false);
    assert.ok(profileState.get(100)?.last_seen);
    const flags = await getOnlineFlagsForPush([100]);
    assert.equal(flags.get(100), false);
  });

  await t.test('multi-device across instances then last disconnect', async () => {
    await cleanupKeys();
    profileState.clear();
    for (const set of Object.values(instances)) set.clear();

    await connect('api-1', 200, 'android');
    await connect('api-2', 200, 'iphone');
    await connect('api-3', 200, 'web');

    assert.equal((await disconnect('api-1', 200, 'android')).offline, false);
    assert.equal((await disconnect('api-2', 200, 'iphone')).offline, false);
    assert.equal((await disconnect('api-3', 200, 'web')).offline, true);
  });

  await t.test('reconnect cycle on shared Redis', async () => {
    await cleanupKeys();
    profileState.clear();
    for (const set of Object.values(instances)) set.clear();

    assert.equal(await connect('api-1', 300, 'a'), true);
    assert.equal((await disconnect('api-1', 300, 'a')).offline, true);
    assert.equal(await connect('api-2', 300, 'b'), true);
    assert.equal((await disconnect('api-2', 300, 'b')).offline, true);
  });
});
