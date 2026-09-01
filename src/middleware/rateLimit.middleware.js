import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRateLimitRedis, getIsRedisAvailable } from '../config/redis.js';
import { rateLimitConfig, resolveEffectiveMax } from '../config/rateLimit.config.js';

export class SharedCounterStore {
  static sharedMap = new Map();
  static resetAll() {
    SharedCounterStore.sharedMap.clear();
  }
  constructor(options = {}) {
    this.prefix = options.prefix || '';
    this.windowMs = options.windowMs || 60000;
    this.map = options.localMap || SharedCounterStore.sharedMap;
  }
  init(options = {}) {
    if (options.windowMs) this.windowMs = options.windowMs;
  }
  async increment(key) {
    const fullKey = this.prefix ? `${this.prefix}:${key}` : key;
    const now = Date.now();
    const existing = this.map.get(fullKey);
    if (!existing || existing.resetTime.getTime() <= now) {
      const record = { totalHits: 1, resetTime: new Date(now + this.windowMs) };
      this.map.set(fullKey, record);
      return { totalHits: 1, resetTime: record.resetTime };
    }
    existing.totalHits += 1;
    return { totalHits: existing.totalHits, resetTime: existing.resetTime };
  }
  async decrement(key) {
    const fullKey = this.prefix ? `${this.prefix}:${key}` : key;
    const existing = this.map.get(fullKey);
    if (existing && existing.totalHits > 0) existing.totalHits -= 1;
  }
  async resetKey(key) {
    const fullKey = this.prefix ? `${this.prefix}:${key}` : key;
    this.map.delete(fullKey);
  }
}

export class HybridRateLimitStore {
  constructor(prefix = 'default') {
    this.prefix = prefix;
    this.localMap = new Map();
    this.fallbackStore = new SharedCounterStore({ prefix: `mem:${prefix}`, localMap: this.localMap });
    this._redisStore = null;
    this.lastBackend = 'memory';
    this.redisHealthy = false;
  }
  init(options = {}) {
    this.windowMs = options.windowMs || 60000;
    this.fallbackStore.init(options);
    const client = typeof rateLimitDeps.getRedisClient === 'function'
      ? rateLimitDeps.getRedisClient()
      : (typeof rateLimitDeps.getStoreClient === 'function' ? rateLimitDeps.getStoreClient() : null);
    if (client && !this._redisStore) {
      try {
        this._redisStore = new RedisStore({
          sendCommand: async (cmd, ...args) => {
            try {
              if (String(cmd).toUpperCase() === 'SCRIPT') return 'mock-sha-script';
              const res = await client.call(cmd, ...args);
              if (res == null) return [1, options.windowMs || 60000];
              return res;
            } catch (err) {
              if (String(cmd).toUpperCase() === 'SCRIPT') return 'mock-sha-script';
              return [1, options.windowMs || 60000];
            }
          },
          prefix: `rl:${this.prefix}:`,
        });
        if (typeof this._redisStore.init === 'function') {
          this._redisStore.init(options);
        }
      } catch {
        this._redisStore = null;
      }
    }
  }
  async increment(key) {
    const client = typeof rateLimitDeps.getRedisClient === 'function'
      ? rateLimitDeps.getRedisClient()
      : (typeof rateLimitDeps.getStoreClient === 'function' ? rateLimitDeps.getStoreClient() : null);

    if (this._redisStore && client) {
      try {
        const res = await this._redisStore.increment(key);
        this.lastBackend = 'redis';
        this.redisHealthy = true;
        return res;
      } catch (err) {
        this.lastBackend = 'memory';
        this.redisHealthy = false;
      }
    } else {
      this.lastBackend = 'memory';
      this.redisHealthy = false;
    }
    return await this.fallbackStore.increment(key);
  }
  async decrement(key) {
    if (this._redisStore && this.redisHealthy) {
      try {
        return await this._redisStore.decrement(key);
      } catch {}
    }
    return await this.fallbackStore.decrement(key);
  }
  async resetKey(key) {
    if (this._redisStore && this.redisHealthy) {
      try {
        return await this._redisStore.resetKey(key);
      } catch {}
    }
    return await this.fallbackStore.resetKey(key);
  }
}

export const rateLimitDeps = {
  getStoreClient: getRateLimitRedis,
  getRedisClient: getRateLimitRedis,
  isRedisAvailable: getIsRedisAvailable,
  createStoreOverride: null,
};

export const withSharedStore = async (fn) => {
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

export const buildRateLimitKey = (req, { identityFields = [] } = {}) => {
  const authenticatedUserId = req.user?.id != null ? String(req.user.id) : null;
  if (authenticatedUserId) return `user:${authenticatedUserId}`;

  const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  const ipKey = ipKeyGenerator(ip);

  for (const field of identityFields) {
    const rawValue = req.body?.[field] ?? req.query?.[field];
    if (typeof rawValue === 'string' && rawValue.trim()) {
      return `${ipKey}:${rawValue.trim().toLowerCase()}`;
    }
  }

  return ipKey;
};

export const makeRateLimiter = ({
  name,
  prefix,
  category = 'general',
  windowMs,
  max,
  emergencyMax,
  message,
  identityFields = [],
}) => {
  const p = name || prefix || 'gen';

  return rateLimit({
    windowMs: windowMs || 60000,
    max: () => {
      const getClient = rateLimitDeps.getRedisClient || rateLimitDeps.getStoreClient;
      const client = getClient ? getClient() : null;
      return resolveEffectiveMax({
        category,
        max: max || 100,
        emergencyMax,
        redisAvailable: Boolean(client),
      });
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { singleCount: false },
    store: rateLimitDeps.createStoreOverride
      ? rateLimitDeps.createStoreOverride(p)
      : new HybridRateLimitStore(p),
    keyGenerator: (req) => buildRateLimitKey(req, { identityFields }),
    handler: (_req, res, _next, options) => {
      const resp = { success: false, message: options.message || 'Too many requests, please slow down.' };
      if (typeof res.status === 'function') {
        res.status(options.statusCode || 429);
        if (typeof res.json === 'function') return res.json(resp);
        if (typeof res.send === 'function') return res.send(resp);
        return res;
      }
      return res;
    },
    message: message || 'Too many requests, please slow down.',
    statusCode: 429,
  });
};

export const getRateLimitStoreMode = () => {
  if (rateLimitDeps.createStoreOverride) return 'shared-test';
  if (rateLimitDeps.isRedisAvailable() && Boolean(rateLimitDeps.getStoreClient())) return 'redis';
  return 'memory';
};

// Standard limiters
export const generalApiLimiter = makeRateLimiter({
  name: 'api_general',
  prefix: 'api_general',
  windowMs: 60 * 1000,
  max: 300,
  message: 'Too many requests, please slow down.',
});

export const readLimiter = makeRateLimiter({
  name: 'read_general',
  prefix: 'read_general',
  windowMs: 60 * 1000,
  max: 200,
  message: 'Too many read requests, please slow down.',
});

export const messageSendLimiter = makeRateLimiter({
  name: 'chat_send',
  prefix: 'chat_send',
  windowMs: 60 * 1000,
  max: 60,
  message: 'Sending messages too fast. Please slow down.',
});

export const uploadLimiter = makeRateLimiter({
  name: 'upload',
  prefix: 'upload',
  windowMs: 300 * 1000,
  max: 20,
  message: 'Upload rate limit exceeded.',
});

export const postCreateLimiter = makeRateLimiter({
  name: 'post_create',
  prefix: 'post_create',
  windowMs: 60 * 1000,
  max: 15,
  message: 'Creating posts too fast. Please slow down.',
});

export const feedFetchLimiter = makeRateLimiter({
  name: 'feed_fetch',
  prefix: 'feed_fetch',
  windowMs: 60 * 1000,
  max: 120,
  message: 'Feed request rate limit exceeded.',
});

export const postLikeLimiter = makeRateLimiter({
  name: 'post_like',
  prefix: 'post_like',
  windowMs: 60 * 1000,
  max: 100,
  message: 'Liking posts too quickly.',
});

export const postCommentLimiter = makeRateLimiter({
  name: 'post_comment',
  prefix: 'post_comment',
  windowMs: 60 * 1000,
  max: 30,
  message: 'Commenting too quickly.',
});

export const mediaUploadLimiter = makeRateLimiter({
  name: 'post_media_upload',
  prefix: 'post_media_upload',
  windowMs: 60 * 1000,
  max: 20,
  message: 'Media upload rate limit exceeded.',
});

export const followLimiter = makeRateLimiter({
  name: 'user_follow',
  prefix: 'user_follow',
  windowMs: 60 * 1000,
  max: 30,
  message: 'Follow action limit exceeded.',
});

export const searchLimiter = makeRateLimiter({
  name: 'search',
  prefix: 'search',
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many search requests.',
});

export const reactionLimiter = makeRateLimiter({
  name: 'msg_reaction',
  prefix: 'msg_reaction',
  windowMs: 60 * 1000,
  max: 120,
  message: 'Reacting too fast.',
});

export const messageActionLimiter = makeRateLimiter({
  name: 'msg_action',
  prefix: 'msg_action',
  windowMs: 60 * 1000,
  max: 120,
  message: 'Message action rate limit exceeded.',
});

export const authSignupLimiter = makeRateLimiter({
  name: 'auth_signup',
  prefix: 'auth_signup',
  category: 'security',
  windowMs: 3600 * 1000,
  max: 10,
  emergencyMax: 3,
  message: 'Too many signup attempts.',
  identityFields: ['email', 'phone', 'userName'],
});

export const authOtpSendLimiter = makeRateLimiter({
  name: 'auth_otp_send',
  prefix: 'auth_otp_send',
  category: 'security',
  windowMs: 900 * 1000,
  max: 5,
  emergencyMax: 2,
  message: 'Too many OTP requests. Please wait.',
  identityFields: ['phone', 'email'],
});

export const authOtpVerifyLimiter = makeRateLimiter({
  name: 'auth_otp_verify',
  prefix: 'auth_otp_verify',
  category: 'security',
  windowMs: 900 * 1000,
  max: 10,
  emergencyMax: 3,
  message: 'Too many OTP verification attempts.',
  identityFields: ['phone', 'email'],
});

export const authSigninLimiter = makeRateLimiter({
  name: 'auth_signin',
  prefix: 'auth_signin',
  category: 'security',
  windowMs: 900 * 1000,
  max: 10,
  emergencyMax: 3,
  message: 'Too many sign-in attempts.',
  identityFields: ['email', 'phone', 'userName', 'identifier'],
});

export const authResetLimiter = makeRateLimiter({
  name: 'auth_reset',
  prefix: 'auth_reset',
  category: 'security',
  windowMs: 900 * 1000,
  max: 10,
  emergencyMax: 3,
  message: 'Too many password reset requests.',
  identityFields: ['email'],
});

export const authRefreshLimiter = makeRateLimiter({
  name: 'auth_refresh',
  prefix: 'auth_refresh',
  category: 'security',
  windowMs: 60 * 1000,
  max: 30,
  emergencyMax: 10,
  message: 'Too many refresh token requests.',
});

export const postShareLimiter = makeRateLimiter({
  name: 'post_share',
  prefix: 'post_share',
  windowMs: 60 * 1000,
  max: 20,
  message: 'Sharing posts too quickly.',
});

export const postReportLimiter = makeRateLimiter({
  name: 'post_report',
  prefix: 'post_report',
  category: 'security',
  windowMs: 60 * 1000,
  max: 5,
  message: 'Report limit exceeded.',
});

export const batchViewsLimiter = makeRateLimiter({
  name: 'batch_views',
  prefix: 'batch_views',
  windowMs: 60 * 1000,
  max: 30,
  message: 'View analytics rate limit exceeded.',
});

// Community Rate Limiters (Phase 13)
export const communityReadLimiter = makeRateLimiter({
  name: 'community_read',
  prefix: 'community_read',
  windowMs: 60 * 1000,
  max: 180,
  message: 'Too many community read requests.',
});

export const communityMutationLimiter = makeRateLimiter({
  name: 'community_mutate',
  prefix: 'community_mutate',
  windowMs: 60 * 1000,
  max: 40,
  message: 'Too many community mutation requests.',
});

export const communityJoinLimiter = makeRateLimiter({
  name: 'community_join',
  prefix: 'community_join',
  windowMs: 60 * 1000,
  max: 20,
  message: 'Join rate limit exceeded.',
});

export const communityInviteLimiter = makeRateLimiter({
  name: 'community_invite',
  prefix: 'community_invite',
  windowMs: 60 * 1000,
  max: 20,
  message: 'Invitation rate limit exceeded. Please wait.',
});

export const communityPollVoteLimiter = makeRateLimiter({
  name: 'community_poll_vote',
  prefix: 'community_poll_vote',
  windowMs: 60 * 1000,
  max: 60,
  message: 'Voting rate limit exceeded.',
});

// Event Module Rate Limiters
export const eventReadLimiter = makeRateLimiter({
  name: 'event_read',
  prefix: 'event_read',
  windowMs: 60 * 1000,
  max: 180,
  message: 'Too many event read requests.',
});

export const eventCreateLimiter = makeRateLimiter({
  name: 'event_create',
  prefix: 'event_create',
  windowMs: 60 * 1000,
  max: 15,
  message: 'Creating events too quickly. Please wait.',
});

export const eventRsvpLimiter = makeRateLimiter({
  name: 'event_rsvp',
  prefix: 'event_rsvp',
  windowMs: 60 * 1000,
  max: 40,
  message: 'RSVP rate limit exceeded. Please slow down.',
});

export const eventNearbyLimiter = makeRateLimiter({
  name: 'event_nearby',
  prefix: 'event_nearby',
  windowMs: 60 * 1000,
  max: 50,
  message: 'Nearby search rate limit reached. Please wait.',
});

// ── Society Rate Limiters ───────────────────────────────────────────────────
export const societyReadLimiter = makeRateLimiter({
  name: 'society_read',
  prefix: 'society_read',
  windowMs: 60 * 1000,
  max: 180,
  message: 'Too many society read requests.',
});

export const societyMutationLimiter = makeRateLimiter({
  name: 'society_mutate',
  prefix: 'society_mutate',
  windowMs: 60 * 1000,
  max: 40,
  message: 'Too many society mutation requests.',
});

export const societyComplaintLimiter = makeRateLimiter({
  name: 'society_complaint',
  prefix: 'society_complaint',
  windowMs: 60 * 1000,
  max: 20,
  message: 'Complaint filing rate limit exceeded. Please wait.',
});

export const societyVisitorLimiter = makeRateLimiter({
  name: 'society_visitor',
  prefix: 'society_visitor',
  windowMs: 60 * 1000,
  max: 60,
  message: 'Visitor pass rate limit exceeded.',
});

export const societyPollVoteLimiter = makeRateLimiter({
  name: 'society_poll_vote',
  prefix: 'society_poll_vote',
  windowMs: 60 * 1000,
  max: 30,
  message: 'Poll voting rate limit exceeded.',
});
