import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { errorResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * Rate Limit Factory
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates express-rate-limit instances with consistent error format.
 * In production, pair with a Redis store (RedisStore from rate-limit-redis)
 * for accurate counting across multiple Node.js instances.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const makeRateLimiter = ({ windowMs, max, message, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders:   false,
    skipSuccessfulRequests,
    keyGenerator: (req) => {
      // Use userId from body/query if available, else fall back to IP
      const userId = req.user?.id || req.body?.sender_id || req.body?.userId || req.query?.userId;
      if (userId) return `user:${userId}`;
      // Use the official ipKeyGenerator helper for proper IPv6 support
      return ipKeyGenerator(req);
    },
    handler: (req, res) => {
      const key = req.user?.id || req.body?.sender_id || req.body?.userId || req.query?.userId || req.ip;
      logger.securityBlock({ reason: 'rate_limit', key, path: req.path, max, windowMs });
      return errorResponse(res, 429, message || 'Too many requests. Please slow down.');
    },
  });


// ── Pre-configured limiters ───────────────────────────────────────────────────

/**
 * Message send: max 60 messages per minute per user.
 * Covers burst protection and spam prevention.
 */
export const messageSendLimiter = makeRateLimiter({
  windowMs: 60 * 1000,   // 1 minute
  max:      60,
  message:  'Too many messages. You can send at most 60 messages per minute.',
});

/**
 * Media upload: max 20 uploads per 5 minutes per user.
 */
export const uploadLimiter = makeRateLimiter({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max:      20,
  message:  'Too many uploads. Max 20 per 5 minutes.',
});

/**
 * General read API: 300 requests per minute.
 */
export const readLimiter = makeRateLimiter({
  windowMs: 60 * 1000,
  max:      300,
  message:  'Too many requests. Please slow down.',
});

/**
 * Reaction toggle: 120 per minute.
 */
export const reactionLimiter = makeRateLimiter({
  windowMs: 60 * 1000,
  max:      120,
  message:  'Too many reactions. Please slow down.',
});

/**
 * Message mutations: edit, forward, pin and delete.
 */
export const messageActionLimiter = makeRateLimiter({
  windowMs: 60 * 1000,
  max:      120,
  message:  'Too many message actions. Please slow down.',
});
