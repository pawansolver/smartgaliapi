import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { errorResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { getRateLimitRedis, getIsRedisAvailable } from '../config/redis.js';
import { rateLimitConfig, resolveEffectiveMax } from '../config/rateLimit.config.js';

/**
 * Distributed Rate Limiting
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Redis-backed via rate-limit-redis when Redis is available so API-1/2/3 share
 * counters. Falls back to in-memory SharedCounterStore when Redis is unavailable
 * (per-instance limits only â€” documented fail-safe).
 *
 * Categories:
 *  - security: auth/OTP/signup/reset â€” emergencyMax when Redis is down
 *  - general:  messages/search/uploads â€” availability-friendly local fallback
 *
 * Store is lazy: Redis connects after modules load (server.js createRedisClients),
 * so each increment resolves the client at request time.
 *
 * Key strategy:
 *  - Authenticated: user:${req.user.id}  (never body/query userId)
 *  - Auth forms:    ip:...:email|mobile|identifier (brute-force buckets)
 *  - Otherwise:     ip via ipKeyGenerator (IPv6-safe)
 *
 * Namespace (with REDIS_KEY_PREFIX=smartgali:):
 *   smartgali:ratelimit:<policy>:<clientKey>
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

/** Mutable for tests: inject Redis client / shared store factory. */
export const rateLimitDeps = {
  getRedisClient: () => (getIsRedisAvailable() ? getRateLimitRedis() : null),
  /** Optional override: (policyPrefix) => Store â€” multi-instance unit tests */
  createStoreOverride: null,
  /** When true, disable singleCount validation (multi-instance sims / Redis IT) */
  allowMultiInstance: false,
};

/**
 * In-process shared store (memory fallback + multi-instance unit tests).
 * Multiple limiter instances with the same prefix share one counter map.
 */
export class SharedCounterStore {
  static buckets = new Map();

  constructor({ prefix = 'shared:', windowMs = 60_000 } = {}) {
    this.prefix = prefix;
    this.windowMs = windowMs;
  }

  init(options) {
    if (options?.windowMs) this.windowMs = options.windowMs;
  }

  #bucket(key) {
    const full = `${this.prefix}${key}`;
    const now = Date.now();
    let entry = SharedCounterStore.buckets.get(full);
    if (!entry || entry.resetTime <= now) {
      entry = { totalHits: 0, resetTime: now + this.windowMs };
      SharedCounterStore.buckets.set(full, entry);
    }
    return entry;
  }

  async increment(key) {
    const entry = this.#bucket(key);
    entry.totalHits += 1;
    return {
      totalHits: entry.totalHits,
      resetTime: new Date(entry.resetTime),
    };
  }

  async decrement(key) {
    const full = `${this.prefix}${key}`;
    const entry = SharedCounterStore.buckets.get(full);
    if (entry && entry.totalHits > 0) entry.totalHits -= 1;
  }

  async resetKey(key) {
    SharedCounterStore.buckets.delete(`${this.prefix}${key}`);
  }

  static resetAll() {
    SharedCounterStore.buckets.clear();
  }
}

/**
 * Lazy Redis-or-memory store. Redis is preferred when the client is ready;
 * on Redis errors, falls back to per-process memory without crashing the API.
 */
export class HybridRateLimitStore {
  /**
   * @param {string} policyPrefix
   * @param {{ keyPrefix?: string }} [options]
   */
  constructor(policyPrefix, { keyPrefix } = {}) {
    this.policyPrefix = policyPrefix;
    this.keyPrefix = keyPrefix ?? rateLimitConfig.keyPrefix;
    this.windowMs = 60_000;
    this._redisStore = null;
    this.lastBackend = 'memory';
    /** null = unknown; true after successful Redis op; false after miss/error */
    this.redisHealthy = null;
    this._memory = new SharedCounterStore({
      prefix: `mem:${policyPrefix}`,
      windowMs: this.windowMs,
    });
  }

  /** Full Redis key prefix used by RedisStore (before ioredis REDIS_KEY_PREFIX). */
  get redisKeyPrefix() {
    return `${this.keyPrefix}${this.policyPrefix}`;
  }

  init(options) {
    if (options?.windowMs) {
      this.windowMs = options.windowMs;
      this._memory.init(options);
    }
    if (this._redisStore && typeof this._redisStore.init === 'function') {
      this._redisStore.init(options);
    }
  }

  #ensureRedisStore() {
    const client = rateLimitDeps.getRedisClient();
    if (!client) {
      this._redisStore = null;
      return null;
    }
    if (!this._redisStore) {
      this._redisStore = new RedisStore({
        prefix: this.redisKeyPrefix,
        sendCommand: (...args) => {
          const live = rateLimitDeps.getRedisClient();
          if (!live) throw new Error('Rate-limit Redis client unavailable');
          return live.call(...args);
        },
      });
      if (typeof this._redisStore.init === 'function') {
        this._redisStore.init({ windowMs: this.windowMs });
      }
    }
    return this._redisStore;
  }

  async increment(key) {
    const redis = this.#ensureRedisStore();
    if (redis) {
      try {
        const result = await redis.increment(key);
        this.lastBackend = 'redis';
        this.redisHealthy = true;
        return result;
      } catch (error) {
        this.redisHealthy = false;
        logger.warn('RATE_LIMIT', 'redis_store_fallback', {
          policy: this.policyPrefix,
          error: error.message,
        });
      }
    } else {
      this.redisHealthy = false;
    }
    this.lastBackend = 'memory';
    return this._memory.increment(key);
  }

  async decrement(key) {
    const redis = this.#ensureRedisStore();
    if (redis) {
      try {
        this.lastBackend = 'redis';
        this.redisHealthy = true;
        return await redis.decrement(key);
      } catch {
        this.redisHealthy = false;
      }
    } else {
      this.redisHealthy = false;
    }
    this.lastBackend = 'memory';
    return this._memory.decrement(key);
  }

  async resetKey(key) {
    const redis = this.#ensureRedisStore();
    if (redis) {
      try {
        this.lastBackend = 'redis';
        this.redisHealthy = true;
        return await redis.resetKey(key);
      } catch {
        this.redisHealthy = false;
      }
    } else {
      this.redisHealthy = false;
    }
    this.lastBackend = 'memory';
    return this._memory.resetKey(key);
  }
}

/**
 * Build the rate-limit client key.
 * @param {import('express').Request} req
 * @param {{ identityFields?: string[] }} [options]
 */
export const buildRateLimitKey = (req, { identityFields = [] } = {}) => {
  // Auth/OTP: bind to IP + submitted identifier (not trusting userId)
  const suppliedIdentity = identityFields
    .map((field) => req.body?.[field])
    .find((value) => typeof value === 'string' && value.trim());

  if (suppliedIdentity) {
    return `${ipKeyGenerator(req.ip)}:${suppliedIdentity.trim().toLowerCase()}`;
  }

  // Authenticated identity ONLY from JWT middleware â€” never body/query
  const userId = req.user?.id ?? req.user?.userId ?? req.user?.sub;
  if (userId !== undefined && userId !== null && `${userId}`.length > 0) {
    return `user:${userId}`;
  }

  return ipKeyGenerator(req.ip);
};

const createStore = (policyPrefix, { keyPrefix } = {}) => {
  if (typeof rateLimitDeps.createStoreOverride === 'function') {
    return rateLimitDeps.createStoreOverride(policyPrefix);
  }
  return new HybridRateLimitStore(policyPrefix, { keyPrefix });
};

/**
 * Factory for express-rate-limit middleware with Redis/Memory hybrid store.
 *
 * @param {object} options
 * @param {'security'|'general'} [options.category='general']
 * @param {number} [options.emergencyMax] - stricter local max when Redis is down (security)
 * @param {string} [options.keyPrefix] - override RedisStore prefix (tests)
 */
export const makeRateLimiter = ({
  name,
  windowMs,
  max,
  emergencyMax,
  category = 'general',
  message,
  skipSuccessfulRequests = false,
  identityFields = [],
  skip,
  keyPrefix,
}) => {
  const store = createStore(`${name}:`, { keyPrefix });

  const resolveMax = () => {
    const client = rateLimitDeps.getRedisClient();
    // Optimistic until first attempt; after Redis miss/error use emergency/local policy.
    const redisAvailable = Boolean(client) && store.redisHealthy !== false;
    return resolveEffectiveMax({
      category,
      max,
      emergencyMax,
      redisAvailable,
    });
  };

  return rateLimit({
    windowMs,
    limit: () => resolveMax(),
    max: () => resolveMax(),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    // Hybrid store already fails over to memory; do not 500 the request.
    passOnStoreError: true,
    // Shared / multi-instance sims intentionally share Redis counters.
    validate: (rateLimitDeps.createStoreOverride || rateLimitDeps.allowMultiInstance)
      ? { singleCount: false }
      : true,
    store,
    skip: (req) => {
      if (!rateLimitConfig.enabled) return true;
      // Security fail_open is expressed as a huge max; general fail_open same.
      if (typeof skip === 'function') return skip(req);
      return false;
    },
    keyGenerator: (req) => buildRateLimitKey(req, { identityFields }),
    handler: (req, res) => {
      const key = buildRateLimitKey(req, { identityFields });
      const effectiveMax = resolveMax();
      logger.securityBlock({
        reason: 'rate_limit',
        limiter: name,
        category,
        key,
        path: req.path,
        max: effectiveMax,
        windowMs,
        redis: Boolean(rateLimitDeps.getRedisClient()),
      });
      return errorResponse(
        res,
        429,
        message || 'Too many requests. Please try again later.',
      );
    },
  });
};

/** Expose store mode for observability/tests (no secrets). */
export const getRateLimitStoreMode = () => {
  if (typeof rateLimitDeps.createStoreOverride === 'function') return 'shared-test';
  if (rateLimitDeps.getRedisClient()) return 'redis';
  return 'memory';
};

// â”€â”€ Pre-configured limiters (values from rateLimit.config.js) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const generalApiLimiter = makeRateLimiter({
  name: 'general',
  category: 'general',
  windowMs: rateLimitConfig.general.windowMs,
  max: rateLimitConfig.general.max,
  message: 'Too many requests. Please slow down.',
  skip: (req) => {
    const path = req.path || '';
    return path === '/health' || path.endsWith('/health');
  },
});

/** Alias for general read traffic (same defaults as before). */
export const readLimiter = makeRateLimiter({
  name: 'read',
  category: 'general',
  windowMs: rateLimitConfig.general.windowMs,
  max: rateLimitConfig.general.max,
  message: 'Too many requests. Please slow down.',
});

export const messageSendLimiter = makeRateLimiter({
  name: 'message',
  category: 'general',
  windowMs: rateLimitConfig.message.windowMs,
  max: rateLimitConfig.message.max,
  message: `Too many messages. You can send at most ${rateLimitConfig.message.max} messages per minute.`,
});

export const uploadLimiter = makeRateLimiter({
  name: 'upload',
  category: 'general',
  windowMs: rateLimitConfig.upload.windowMs,
  max: rateLimitConfig.upload.max,
  message: `Too many uploads. Max ${rateLimitConfig.upload.max} per 5 minutes.`,
});

export const postCreateLimiter = makeRateLimiter({
  name: 'post_create',
  category: 'general',
  windowMs: rateLimitConfig.postCreate.windowMs,
  max: rateLimitConfig.postCreate.max,
  message: 'Too many posts created. Please slow down.',
});

export const feedFetchLimiter = makeRateLimiter({
  name: 'feed_fetch',
  category: 'general',
  windowMs: rateLimitConfig.feedFetch.windowMs,
  max: rateLimitConfig.feedFetch.max,
  message: 'Too many feed requests. Please slow down.',
});

export const postLikeLimiter = makeRateLimiter({
  name: 'post_like',
  category: 'general',
  windowMs: rateLimitConfig.postLike.windowMs,
  max: rateLimitConfig.postLike.max,
  message: 'Too many like requests. Please slow down.',
});

export const postCommentLimiter = makeRateLimiter({
  name: 'post_comment',
  category: 'general',
  windowMs: rateLimitConfig.postComment.windowMs,
  max: rateLimitConfig.postComment.max,
  message: 'Too many comment requests. Please slow down.',
});

export const mediaUploadLimiter = makeRateLimiter({
  name: 'media_upload',
  category: 'general',
  windowMs: rateLimitConfig.mediaUpload.windowMs,
  max: rateLimitConfig.mediaUpload.max,
  message: 'Too many upload requests. Please slow down.',
});

export const followLimiter = makeRateLimiter({
  name: 'follow',
  category: 'general',
  windowMs: rateLimitConfig.follow.windowMs,
  max: rateLimitConfig.follow.max,
  message: 'Too many follow/unfollow requests. Please slow down.',
});

export const searchLimiter = makeRateLimiter({
  name: 'search',
  category: 'general',
  windowMs: rateLimitConfig.search.windowMs,
  max: rateLimitConfig.search.max,
  message: 'Too many search requests. Please slow down.',
});

export const reactionLimiter = makeRateLimiter({
  name: 'reaction',
  category: 'general',
  windowMs: rateLimitConfig.reaction.windowMs,
  max: rateLimitConfig.reaction.max,
  message: 'Too many reactions. Please slow down.',
});

export const messageActionLimiter = makeRateLimiter({
  name: 'message_action',
  category: 'general',
  windowMs: rateLimitConfig.messageAction.windowMs,
  max: rateLimitConfig.messageAction.max,
  message: 'Too many message actions. Please slow down.',
});

export const authSignupLimiter = makeRateLimiter({
  name: 'auth_signup',
  category: 'security',
  windowMs: rateLimitConfig.authSignup.windowMs,
  max: rateLimitConfig.authSignup.max,
  emergencyMax: rateLimitConfig.authSignup.emergencyMax,
  identityFields: ['email', 'mobile'],
  message: 'Too many signup attempts. Please try again later.',
});

export const authOtpSendLimiter = makeRateLimiter({
  name: 'auth_otp_send',
  category: 'security',
  windowMs: rateLimitConfig.authOtpSend.windowMs,
  max: rateLimitConfig.authOtpSend.max,
  emergencyMax: rateLimitConfig.authOtpSend.emergencyMax,
  identityFields: ['identifier', 'email', 'mobile'],
  message: 'Too many verification code requests. Please try again later.',
});

export const authOtpVerifyLimiter = makeRateLimiter({
  name: 'auth_otp_verify',
  category: 'security',
  windowMs: rateLimitConfig.authOtpVerify.windowMs,
  max: rateLimitConfig.authOtpVerify.max,
  emergencyMax: rateLimitConfig.authOtpVerify.emergencyMax,
  identityFields: ['identifier', 'email'],
  message: 'Too many verification attempts. Please try again later.',
});

export const authSigninLimiter = makeRateLimiter({
  name: 'auth_signin',
  category: 'security',
  windowMs: rateLimitConfig.authSignin.windowMs,
  max: rateLimitConfig.authSignin.max,
  emergencyMax: rateLimitConfig.authSignin.emergencyMax,
  identityFields: ['identifier'],
  message: 'Too many sign-in attempts. Please try again later.',
});

export const authResetLimiter = makeRateLimiter({
  name: 'auth_reset',
  category: 'security',
  windowMs: rateLimitConfig.authReset.windowMs,
  max: rateLimitConfig.authReset.max,
  emergencyMax: rateLimitConfig.authReset.emergencyMax,
  message: 'Too many password reset attempts. Please try again later.',
});

export const authRefreshLimiter = makeRateLimiter({
  name: 'auth_refresh',
  category: 'security',
  windowMs: rateLimitConfig.authRefresh.windowMs,
  max: rateLimitConfig.authRefresh.max,
  emergencyMax: rateLimitConfig.authRefresh.emergencyMax,
  message: 'Too many token refresh attempts. Please try again later.',
});


