import test from 'node:test';
import assert from 'node:assert/strict';
import { ipKeyGenerator } from 'express-rate-limit';
import {
  buildRateLimitKey,
  makeRateLimiter,
  SharedCounterStore,
  HybridRateLimitStore,
  rateLimitDeps,
  getRateLimitStoreMode,
  messageSendLimiter,
  uploadLimiter,
  searchLimiter,
  authSigninLimiter,
  generalApiLimiter,
} from '../src/middleware/rateLimit.middleware.js';
import { rateLimitConfig, resolveEffectiveMax } from '../src/config/rateLimit.config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
      headersSent: false,
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

const withSharedStore = async (fn) => {
  SharedCounterStore.resetAll();
  const previous = rateLimitDeps.createStoreOverride;
  rateLimitDeps.createStoreOverride = (policyPrefix) =>
    new SharedCounterStore({ prefix: `dist:${policyPrefix}`, windowMs: 60_000 });
  try {
    return await fn();
  } finally {
    rateLimitDeps.createStoreOverride = previous;
    SharedCounterStore.resetAll();
  }
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
test('rateLimitConfig loads expected default policies', () => {
  assert.equal(rateLimitConfig.enabled, true);
  assert.equal(rateLimitConfig.message.max, 60);
  assert.equal(rateLimitConfig.message.windowMs, 60_000);
  assert.equal(rateLimitConfig.upload.max, 20);
  assert.equal(rateLimitConfig.upload.windowMs, 300_000);
  assert.equal(rateLimitConfig.search.max, 30);
  assert.equal(rateLimitConfig.general.max, 300);
  assert.equal(rateLimitConfig.authSignin.max, 10);
  assert.equal(rateLimitConfig.authSignin.emergencyMax, 3);
  assert.equal(rateLimitConfig.authOtpSend.emergencyMax, 2);
  assert.equal(rateLimitConfig.redisFailureMode.security, 'local_fallback');
  assert.equal(rateLimitConfig.redisFailureMode.general, 'local_fallback');
  assert.match(rateLimitConfig.keyPrefix, /ratelimit/);
});

test('resolveEffectiveMax applies stricter emergency cap for security when Redis down', () => {
  assert.equal(
    resolveEffectiveMax({
      category: 'security',
      max: 10,
      emergencyMax: 3,
      redisAvailable: true,
    }),
    10,
  );
  assert.equal(
    resolveEffectiveMax({
      category: 'security',
      max: 10,
      emergencyMax: 3,
      redisAvailable: false,
    }),
    3,
  );
});

test('resolveEffectiveMax keeps general max on Redis-down local fallback', () => {
  assert.equal(
    resolveEffectiveMax({
      category: 'general',
      max: 60,
      redisAvailable: false,
    }),
    60,
  );
});

test('security-sensitive limiter uses emergencyMax when Redis unavailable', async () => {
  SharedCounterStore.resetAll();
  const previousGet = rateLimitDeps.getRedisClient;
  const previousOverride = rateLimitDeps.createStoreOverride;
  rateLimitDeps.getRedisClient = () => null;
  rateLimitDeps.createStoreOverride = (policyPrefix) =>
    new SharedCounterStore({ prefix: `emerg:${policyPrefix}`, windowMs: 60_000 });

  try {
    const limiter = makeRateLimiter({
      name: 'auth_signin_emerg',
      category: 'security',
      windowMs: 60_000,
      max: 10,
      emergencyMax: 2,
      identityFields: ['identifier'],
      message: 'Too many sign-in attempts.',
    });
    const req = mockReq({
      ip: '203.0.113.40',
      body: { identifier: 'brute@example.com' },
    });
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, req)).status, 429);
  } finally {
    rateLimitDeps.getRedisClient = previousGet;
    rateLimitDeps.createStoreOverride = previousOverride;
    SharedCounterStore.resetAll();
  }
});

test('general limiter keeps normal max when Redis unavailable', async () => {
  SharedCounterStore.resetAll();
  const previousGet = rateLimitDeps.getRedisClient;
  const previousOverride = rateLimitDeps.createStoreOverride;
  rateLimitDeps.getRedisClient = () => null;
  rateLimitDeps.createStoreOverride = (policyPrefix) =>
    new SharedCounterStore({ prefix: `genfb:${policyPrefix}`, windowMs: 60_000 });

  try {
    const limiter = makeRateLimiter({
      name: 'message_fb',
      category: 'general',
      windowMs: 60_000,
      max: 4,
      message: 'Too many messages.',
    });
    const req = mockReq({ user: { id: 55 } });
    for (let i = 0; i < 4; i += 1) {
      assert.equal((await hitLimiter(limiter, req)).status, 200);
    }
    assert.equal((await hitLimiter(limiter, req)).status, 429);
  } finally {
    rateLimitDeps.getRedisClient = previousGet;
    rateLimitDeps.createStoreOverride = previousOverride;
    SharedCounterStore.resetAll();
  }
});

test('HybridRateLimitStore resumes redis backend after client returns', async () => {
  const previousGet = rateLimitDeps.getRedisClient;
  rateLimitDeps.getRedisClient = () => null;

  const store = new HybridRateLimitStore('resume:');
  store.init({ windowMs: 60_000 });
  await store.increment('user:1');
  assert.equal(store.lastBackend, 'memory');
  assert.equal(store.redisHealthy, false);

  // Inject redis store path without real RedisStore
  rateLimitDeps.getRedisClient = () => ({ call: async () => 1 });
  store._redisStore = {
    increment: async () => ({
      totalHits: 1,
      resetTime: new Date(Date.now() + 60_000),
    }),
    decrement: async () => {},
    resetKey: async () => {},
  };

  await store.increment('user:1');
  assert.equal(store.lastBackend, 'redis');
  assert.equal(store.redisHealthy, true);
  rateLimitDeps.getRedisClient = previousGet;
  SharedCounterStore.resetAll();
});

test('exported limiters are middleware functions', () => {
  for (const limiter of [
    messageSendLimiter,
    uploadLimiter,
    searchLimiter,
    authSigninLimiter,
    generalApiLimiter,
  ]) {
    assert.equal(typeof limiter, 'function');
  }
});

// ---------------------------------------------------------------------------
// Key generation / security
// ---------------------------------------------------------------------------
test('buildRateLimitKey prefers authenticated req.user.id', () => {
  const key = buildRateLimitKey(mockReq({
    user: { id: 25 },
    body: { sender_id: 999, userId: 888 },
    query: { userId: 777 },
  }));
  assert.equal(key, 'user:25');
});

test('buildRateLimitKey ignores forged body/query user ids when unauthenticated', () => {
  const key = buildRateLimitKey(mockReq({
    body: { sender_id: 999, userId: 888 },
    query: { userId: 777 },
  }));
  assert.equal(key, ipKeyGenerator('203.0.113.10'));
  assert.ok(!key.includes('999'));
  assert.ok(!key.includes('888'));
});

test('buildRateLimitKey isolates user A and user B buckets', () => {
  assert.equal(buildRateLimitKey(mockReq({ user: { id: 'A' } })), 'user:A');
  assert.equal(buildRateLimitKey(mockReq({ user: { id: 'B' } })), 'user:B');
  assert.notEqual(
    buildRateLimitKey(mockReq({ user: { id: 'A' } })),
    buildRateLimitKey(mockReq({ user: { id: 'B' } })),
  );
});

test('buildRateLimitKey isolates IP A and IP B for public endpoints', () => {
  const a = buildRateLimitKey(mockReq({ ip: '198.51.100.1' }));
  const b = buildRateLimitKey(mockReq({ ip: '198.51.100.2' }));
  assert.equal(a, ipKeyGenerator('198.51.100.1'));
  assert.equal(b, ipKeyGenerator('198.51.100.2'));
  assert.notEqual(a, b);
});

test('auth identityFields combine IP with identifier (not body userId)', () => {
  const key = buildRateLimitKey(
    mockReq({
      ip: '203.0.113.50',
      body: { identifier: 'User@Example.com', userId: 42 },
    }),
    { identityFields: ['identifier'] },
  );
  assert.equal(key, `${ipKeyGenerator('203.0.113.50')}:user@example.com`);
  assert.ok(!key.includes('42'));
});

// ---------------------------------------------------------------------------
// Shared-store multi-instance simulation (distributed counters)
// ---------------------------------------------------------------------------
test('multi-instance simulation shares one counter across three API limiters', async () => {
  await withSharedStore(async () => {
    const max = 100;
    const mk = () => makeRateLimiter({
      name: 'multi_inst',
      windowMs: 60_000,
      max,
      message: 'limited',
    });

    // Three "API instances" — separate middleware, shared store
    const api1 = mk();
    const api2 = mk();
    const api3 = mk();
    const req = mockReq({ user: { id: 25 } });

    for (let i = 0; i < 40; i += 1) {
      const r = await hitLimiter(api1, req);
      assert.equal(r.status, 200, `api1 hit ${i + 1}`);
    }
    for (let i = 0; i < 30; i += 1) {
      const r = await hitLimiter(api2, req);
      assert.equal(r.status, 200, `api2 hit ${i + 1}`);
    }
    for (let i = 0; i < 30; i += 1) {
      const r = await hitLimiter(api3, req);
      assert.equal(r.status, 200, `api3 hit ${i + 1}`);
    }

    const blocked = await hitLimiter(api2, req);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body?.success, false);
    assert.match(blocked.body?.message || '', /limited|Too many/i);
  });
});

test('same authenticated user across instances shares one bucket', async () => {
  await withSharedStore(async () => {
    const mk = () => makeRateLimiter({
      name: 'user_share',
      windowMs: 60_000,
      max: 5,
      message: 'user limited',
    });
    const a = mk();
    const b = mk();
    const req = mockReq({ user: { id: 7 } });

    for (let i = 0; i < 3; i += 1) assert.equal((await hitLimiter(a, req)).status, 200);
    for (let i = 0; i < 2; i += 1) assert.equal((await hitLimiter(b, req)).status, 200);
    assert.equal((await hitLimiter(a, req)).status, 429);
  });
});

test('user A and user B have independent rate-limit buckets', async () => {
  await withSharedStore(async () => {
    const limiter = makeRateLimiter({
      name: 'user_iso',
      windowMs: 60_000,
      max: 2,
      message: 'iso limited',
    });
    const userA = mockReq({ user: { id: 'A' } });
    const userB = mockReq({ user: { id: 'B' } });

    assert.equal((await hitLimiter(limiter, userA)).status, 200);
    assert.equal((await hitLimiter(limiter, userA)).status, 200);
    assert.equal((await hitLimiter(limiter, userA)).status, 429);

    assert.equal((await hitLimiter(limiter, userB)).status, 200);
    assert.equal((await hitLimiter(limiter, userB)).status, 200);
    assert.equal((await hitLimiter(limiter, userB)).status, 429);
  });
});

// ---------------------------------------------------------------------------
// Policy limiters
// ---------------------------------------------------------------------------
test('messageSendLimiter rejects after configured max', async () => {
  await withSharedStore(async () => {
    const limiter = makeRateLimiter({
      name: 'message_test',
      windowMs: rateLimitConfig.message.windowMs,
      max: 3,
      message: 'Too many messages.',
    });
    const req = mockReq({ user: { id: 11 }, path: '/api/v1/message/send' });
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    const blocked = await hitLimiter(limiter, req);
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.message, /messages/i);
  });
});

test('uploadLimiter rejects after configured max', async () => {
  await withSharedStore(async () => {
    const limiter = makeRateLimiter({
      name: 'upload_test',
      windowMs: 60_000,
      max: 2,
      message: 'Too many uploads.',
    });
    const req = mockReq({ user: { id: 12 }, path: '/api/v1/chat/upload-attachment' });
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, req)).status, 429);
  });
});

test('searchLimiter rejects after configured max', async () => {
  await withSharedStore(async () => {
    const limiter = makeRateLimiter({
      name: 'search_test',
      windowMs: 60_000,
      max: 2,
      message: 'Too many search requests.',
    });
    const req = mockReq({ user: { id: 13 }, path: '/api/v1/message/chat/1/search' });
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, req)).status, 429);
  });
});

test('authSigninLimiter brute-force protection and isolation by identifier', async () => {
  await withSharedStore(async () => {
    const limiter = makeRateLimiter({
      name: 'auth_signin_test',
      windowMs: 60_000,
      max: 3,
      identityFields: ['identifier'],
      message: 'Too many sign-in attempts.',
    });
    const attacker = mockReq({
      ip: '198.51.100.9',
      body: { identifier: 'victim@example.com' },
      path: '/api/v1/auth/signin',
    });
    assert.equal((await hitLimiter(limiter, attacker)).status, 200);
    assert.equal((await hitLimiter(limiter, attacker)).status, 200);
    assert.equal((await hitLimiter(limiter, attacker)).status, 200);
    assert.equal((await hitLimiter(limiter, attacker)).status, 429);

    const other = mockReq({
      ip: '198.51.100.9',
      body: { identifier: 'other@example.com' },
      path: '/api/v1/auth/signin',
    });
    assert.equal((await hitLimiter(limiter, other)).status, 200);
  });
});

test('general limiter allows requests within limit', async () => {
  await withSharedStore(async () => {
    const limiter = makeRateLimiter({
      name: 'general_test',
      windowMs: 60_000,
      max: 5,
      message: 'Too many requests.',
    });
    const req = mockReq({ ip: '203.0.113.80' });
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await hitLimiter(limiter, req)).status, 200);
    }
    assert.equal((await hitLimiter(limiter, req)).status, 429);
  });
});

test('window reset allows traffic after bucket expiry', async () => {
  await withSharedStore(async () => {
    const limiter = makeRateLimiter({
      name: 'window_reset',
      windowMs: 30,
      max: 1,
      message: 'limited',
    });
    const req = mockReq({ user: { id: 99 } });
    assert.equal((await hitLimiter(limiter, req)).status, 200);
    assert.equal((await hitLimiter(limiter, req)).status, 429);
    await new Promise((r) => setTimeout(r, 40));
    assert.equal((await hitLimiter(limiter, req)).status, 200);
  });
});

// ---------------------------------------------------------------------------
// Redis failure / hybrid store
// ---------------------------------------------------------------------------
test('HybridRateLimitStore falls back to memory when Redis client is null', async () => {
  const previousGet = rateLimitDeps.getRedisClient;
  rateLimitDeps.getRedisClient = () => null;
  try {
    const store = new HybridRateLimitStore('failsafe:');
    store.init({ windowMs: 60_000 });
    const a = await store.increment('user:1');
    const b = await store.increment('user:1');
    assert.equal(a.totalHits, 1);
    assert.equal(b.totalHits, 2);
  } finally {
    rateLimitDeps.getRedisClient = previousGet;
  }
});

test('HybridRateLimitStore falls back when Redis store increment fails', async () => {
  const previousGet = rateLimitDeps.getRedisClient;
  rateLimitDeps.getRedisClient = () => ({ call: async () => null }); // truthy client

  try {
    const store = new HybridRateLimitStore('recover:');
    store.init({ windowMs: 60_000 });
    let redisCalls = 0;
    // Inject a failing redis store without constructing real RedisStore (avoids async leaks)
    store._redisStore = {
      increment: async () => {
        redisCalls += 1;
        throw new Error('simulated redis blip');
      },
      decrement: async () => {},
      resetKey: async () => {},
    };

    const result = await store.increment('user:2');
    assert.equal(redisCalls, 1);
    assert.equal(result.totalHits, 1);
  } finally {
    rateLimitDeps.getRedisClient = previousGet;
    SharedCounterStore.resetAll();
  }
});

test('getRateLimitStoreMode reports shared-test when override is set', async () => {
  await withSharedStore(async () => {
    assert.equal(getRateLimitStoreMode(), 'shared-test');
  });
});

test('forged sender_id cannot bypass authenticated user bucket', async () => {
  await withSharedStore(async () => {
    const limiter = makeRateLimiter({
      name: 'bypass_test',
      windowMs: 60_000,
      max: 2,
      message: 'limited',
    });
    const real = mockReq({ user: { id: 5 }, body: { sender_id: 5 } });
    assert.equal((await hitLimiter(limiter, real)).status, 200);
    assert.equal((await hitLimiter(limiter, real)).status, 200);

    // Attacker spoofs another sender_id but JWT is still user 5
    const spoof = mockReq({ user: { id: 5 }, body: { sender_id: 999 } });
    assert.equal((await hitLimiter(limiter, spoof)).status, 429);
  });
});
