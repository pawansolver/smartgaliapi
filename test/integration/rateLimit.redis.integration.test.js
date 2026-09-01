/**
 * REAL Redis multi-instance rate-limit integration tests.
 *
 * Requires a live Redis process. Connection order:
 *  1. RATE_LIMIT_TEST_REDIS_URL / REDIS_URL
 *  2. REDIS_HOST:REDIS_PORT (default 127.0.0.1:6379)
 *  3. redis-memory-server (devDependency) if external Redis is down
 *
 * Run:
 *   npm run test:ratelimit:redis
 *
 * Start Redis (examples):
 *   docker run --name smartgali-test-redis -p 6379:6379 -d redis:7
 *   # or local redis-server
 *
 * Keys use isolated prefix: test:ratelimit: (under REDIS_KEY_PREFIX).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import {
  makeRateLimiter,
  rateLimitDeps,
  buildRateLimitKey,
  HybridRateLimitStore,
} from '../../src/middleware/rateLimit.middleware.js';

const TEST_KEY_PREFIX = process.env.RATE_LIMIT_TEST_KEY_PREFIX || 'test:ratelimit:';
const APP_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'smartgali:';

const mockReq = (overrides = {}) => ({
  ip: '203.0.113.10',
  path: '/api/v1/test',
  body: {},
  query: {},
  headers: {},
  ...overrides,
});

const hitLimiter = (limiter, req) =>
  new Promise((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      getHeader() { return undefined; },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ status: this.statusCode, body });
        return this;
      },
    };
    limiter(req, res, () => resolve({ status: 200, body: null }));
  });

let redisServer = null;
let client = null;
let redisMeta = { version: 'unknown', address: 'unavailable' };

const tryConnectExternal = async () => {
  const url = process.env.RATE_LIMIT_TEST_REDIS_URL || process.env.REDIS_URL || null;
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
      port: Number(process.env.RATE_LIMIT_TEST_REDIS_PORT || process.env.REDIS_PORT || 6379),
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

const cleanupTestKeys = async () => {
  if (!client) return;
  const raw = client.duplicate({ keyPrefix: '' });
  try {
    if (raw.status !== 'ready') await raw.connect().catch(() => {});
    const fullPattern = `${APP_KEY_PREFIX}${TEST_KEY_PREFIX}*`;
    let cursor = '0';
    do {
      const [next, keys] = await raw.scan(cursor, 'MATCH', fullPattern, 'COUNT', 200);
      cursor = next;
      if (keys.length) await raw.del(...keys);
    } while (cursor !== '0');
  } finally {
    try { await raw.quit(); } catch { raw.disconnect(); }
  }
};

test('real Redis multi-instance rate limiting', async (t) => {
  client = await tryConnectExternal();
  if (!client) client = await tryMemoryServer();

  if (!client) {
    t.skip('Real Redis unavailable — start Redis or ensure redis-memory-server works. See documents/RATE_LIMITING.md');
    return;
  }

  const info = await client.info('server').catch(() => '');
  const versionMatch = /redis_version:([^\r\n]+)/.exec(info);
  redisMeta = {
    version: versionMatch?.[1] || 'unknown',
    address: client.options.host
      ? `${client.options.host}:${client.options.port}`
      : (process.env.RATE_LIMIT_TEST_REDIS_URL || process.env.REDIS_URL || 'memory-server'),
  };

  const previousGet = rateLimitDeps.getRedisClient;
  const previousAllow = rateLimitDeps.allowMultiInstance;
  const previousOverride = rateLimitDeps.createStoreOverride;
  rateLimitDeps.getRedisClient = () => client;
  rateLimitDeps.allowMultiInstance = true;
  rateLimitDeps.createStoreOverride = null;

  t.after(async () => {
    rateLimitDeps.getRedisClient = previousGet;
    rateLimitDeps.allowMultiInstance = previousAllow;
    rateLimitDeps.createStoreOverride = previousOverride;
    try { await cleanupTestKeys(); } catch { /* ignore */ }
    try { await client.quit(); } catch { client.disconnect(); }
    client = null;
    if (redisServer) {
      try { await redisServer.stop(); } catch { /* ignore */ }
      redisServer = null;
    }
  });

  await t.test('reports Redis connection metadata', () => {
    assert.ok(redisMeta.version);
    assert.ok(redisMeta.address);
    console.log(
      `Redis integration: version=${redisMeta.version} address=${redisMeta.address} `
      + `prefix=${APP_KEY_PREFIX}${TEST_KEY_PREFIX}`,
    );
  });

  await t.test('shared counter across 3 limiter instances (MAX=9)', async () => {
    await cleanupTestKeys();
    const mk = () => makeRateLimiter({
      name: 'redis_multi',
      category: 'general',
      windowMs: 60_000,
      max: 9,
      keyPrefix: TEST_KEY_PREFIX,
      message: 'limited',
    });
    const api1 = mk();
    const api2 = mk();
    const api3 = mk();
    const req = mockReq({ user: { id: 100 } });

    for (let i = 0; i < 3; i += 1) {
      assert.equal((await hitLimiter(api1, req)).status, 200);
    }
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await hitLimiter(api2, req)).status, 200);
    }
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await hitLimiter(api3, req)).status, 200);
    }

    const blocked = await hitLimiter(api2, req);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body?.success, false);
  });

  await t.test('user isolation on real Redis', async () => {
    await cleanupTestKeys();
    const mk = () => makeRateLimiter({
      name: 'redis_user',
      category: 'general',
      windowMs: 60_000,
      max: 9,
      keyPrefix: TEST_KEY_PREFIX,
      message: 'limited',
    });
    const api1 = mk();
    const api2 = mk();
    const api3 = mk();
    const userA = mockReq({ user: { id: 100 } });

    for (let i = 0; i < 3; i += 1) assert.equal((await hitLimiter(api1, userA)).status, 200);
    for (let i = 0; i < 3; i += 1) assert.equal((await hitLimiter(api2, userA)).status, 200);
    for (let i = 0; i < 3; i += 1) assert.equal((await hitLimiter(api3, userA)).status, 200);
    assert.equal((await hitLimiter(api1, userA)).status, 429);

    const userB = mockReq({ user: { id: 101 } });
    assert.equal((await hitLimiter(api1, userB)).status, 200);
  });

  await t.test('forged sender_id cannot change Redis bucket', async () => {
    await cleanupTestKeys();
    const limiter = makeRateLimiter({
      name: 'redis_bypass',
      category: 'general',
      windowMs: 60_000,
      max: 2,
      keyPrefix: TEST_KEY_PREFIX,
      message: 'limited',
    });
    const req = mockReq({ user: { id: 100 }, body: { sender_id: 999 } });
    assert.equal(buildRateLimitKey(req), 'user:100');
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, mockReq({
      user: { id: 100 },
      body: { sender_id: 999 },
    }))).status, 429);
  });

  await t.test('creates Redis keys under configured test prefix', async () => {
    await cleanupTestKeys();
    const store = new HybridRateLimitStore('redis_keys:', { keyPrefix: TEST_KEY_PREFIX });
    store.init({ windowMs: 60_000 });
    await store.increment('user:100');
    assert.equal(store.lastBackend, 'redis');

    const raw = client.duplicate({ keyPrefix: '' });
    if (raw.status !== 'ready') await raw.connect().catch(() => {});
    try {
      const fullPattern = `${APP_KEY_PREFIX}${TEST_KEY_PREFIX}redis_keys:*`;
      const keys = await raw.keys(fullPattern);
      assert.ok(keys.length >= 1, `expected keys matching ${fullPattern}`);
      for (const key of keys) {
        assert.ok(key.startsWith(`${APP_KEY_PREFIX}${TEST_KEY_PREFIX}`));
        assert.ok(!key.toLowerCase().includes('password'));
      }
    } finally {
      try { await raw.quit(); } catch { raw.disconnect(); }
    }
  });

  await t.test('window reset on real Redis', async () => {
    await cleanupTestKeys();
    const limiter = makeRateLimiter({
      name: 'redis_window',
      category: 'general',
      windowMs: 1000,
      max: 1,
      keyPrefix: TEST_KEY_PREFIX,
      message: 'limited',
    });
    const req = mockReq({ user: { id: 200 } });
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, req)).status, 429);
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal((await hitLimiter(limiter, req)).status, 200);
  });
});
