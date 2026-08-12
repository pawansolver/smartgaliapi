/**
 * Centralized rate-limit configuration (env-driven).
 *
 * Defaults preserve Phase 2 / existing middleware values.
 * Redis key namespace (under REDIS_KEY_PREFIX when using cacheClient):
 *   ratelimit:<policy>:...
 */

const toInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const toBool = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

/**
 * Failure modes when Redis is unavailable:
 *  - local_fallback: keep limiting via per-process memory (default)
 *  - fail_open: skip limiting (NOT used for security-sensitive by default)
 */
const parseFailureMode = (value, fallback) => {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (normalized === 'fail_open' || normalized === 'local_fallback') return normalized;
  return fallback;
};

export const rateLimitConfig = {
  enabled: toBool(process.env.RATE_LIMIT_ENABLED, true),

  /**
   * Prefix passed to each RedisStore instance (appended after ioredis REDIS_KEY_PREFIX).
   * Final key example: smartgali:ratelimit:message:<clientKey>
   */
  keyPrefix: process.env.RATE_LIMIT_KEY_PREFIX || 'ratelimit:',

  /**
   * Redis-down policy by limiter category.
   * Security-sensitive always keeps a (stricter) local emergency limit.
   */
  redisFailureMode: {
    security: parseFailureMode(
      process.env.RATE_LIMIT_REDIS_FAILURE_MODE_SECURITY,
      'local_fallback',
    ),
    general: parseFailureMode(
      process.env.RATE_LIMIT_REDIS_FAILURE_MODE_GENERAL,
      'local_fallback',
    ),
  },

  general: {
    windowMs: toInt(process.env.RATE_LIMIT_GENERAL_WINDOW_MS, 60_000),
    max: toInt(process.env.RATE_LIMIT_GENERAL_MAX, 300),
  },
  message: {
    windowMs: toInt(process.env.RATE_LIMIT_MESSAGE_WINDOW_MS, 60_000),
    max: toInt(process.env.RATE_LIMIT_MESSAGE_MAX, 60),
  },
  upload: {
    windowMs: toInt(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS, 300_000),
    max: toInt(process.env.RATE_LIMIT_UPLOAD_MAX, 20),
  },
  search: {
    windowMs: toInt(process.env.RATE_LIMIT_SEARCH_WINDOW_MS, 60_000),
    max: toInt(process.env.RATE_LIMIT_SEARCH_MAX, 30),
  },
  reaction: {
    windowMs: toInt(process.env.RATE_LIMIT_REACTION_WINDOW_MS, 60_000),
    max: toInt(process.env.RATE_LIMIT_REACTION_MAX, 120),
  },
  messageAction: {
    windowMs: toInt(process.env.RATE_LIMIT_MESSAGE_ACTION_WINDOW_MS, 60_000),
    max: toInt(process.env.RATE_LIMIT_MESSAGE_ACTION_MAX, 120),
  },
  authSignup: {
    windowMs: toInt(process.env.RATE_LIMIT_AUTH_SIGNUP_WINDOW_MS, 3_600_000),
    max: toInt(process.env.RATE_LIMIT_AUTH_SIGNUP_MAX, 10),
    /** Stricter per-process cap when Redis is down */
    emergencyMax: toInt(process.env.RATE_LIMIT_AUTH_SIGNUP_EMERGENCY_MAX, 3),
  },
  authOtpSend: {
    windowMs: toInt(process.env.RATE_LIMIT_AUTH_OTP_SEND_WINDOW_MS, 900_000),
    max: toInt(process.env.RATE_LIMIT_AUTH_OTP_SEND_MAX, 5),
    emergencyMax: toInt(process.env.RATE_LIMIT_AUTH_OTP_SEND_EMERGENCY_MAX, 2),
  },
  authOtpVerify: {
    windowMs: toInt(process.env.RATE_LIMIT_AUTH_OTP_VERIFY_WINDOW_MS, 900_000),
    max: toInt(process.env.RATE_LIMIT_AUTH_OTP_VERIFY_MAX, 10),
    emergencyMax: toInt(process.env.RATE_LIMIT_AUTH_OTP_VERIFY_EMERGENCY_MAX, 3),
  },
  authSignin: {
    windowMs: toInt(process.env.RATE_LIMIT_AUTH_SIGNIN_WINDOW_MS, 900_000),
    max: toInt(process.env.RATE_LIMIT_AUTH_SIGNIN_MAX, 10),
    emergencyMax: toInt(process.env.RATE_LIMIT_AUTH_SIGNIN_EMERGENCY_MAX, 3),
  },
  authReset: {
    windowMs: toInt(process.env.RATE_LIMIT_AUTH_RESET_WINDOW_MS, 900_000),
    max: toInt(process.env.RATE_LIMIT_AUTH_RESET_MAX, 10),
    emergencyMax: toInt(process.env.RATE_LIMIT_AUTH_RESET_EMERGENCY_MAX, 3),
  },
  authRefresh: {
    windowMs: toInt(process.env.RATE_LIMIT_AUTH_REFRESH_WINDOW_MS, 60_000),
    max: toInt(process.env.RATE_LIMIT_AUTH_REFRESH_MAX, 30),
    emergencyMax: toInt(process.env.RATE_LIMIT_AUTH_REFRESH_EMERGENCY_MAX, 10),
  },
};

/** Resolve effective max for a limiter given Redis availability. */
export const resolveEffectiveMax = ({
  category = 'general',
  max,
  emergencyMax,
  redisAvailable,
}) => {
  if (redisAvailable) return max;

  if (category === 'security') {
    if (rateLimitConfig.redisFailureMode.security === 'fail_open') {
      // Explicit opt-in only — not the default. Unlimited when Redis down.
      return Number.MAX_SAFE_INTEGER;
    }
    const emergency = emergencyMax ?? Math.max(1, Math.floor(max / 3));
    return Math.min(max, emergency);
  }

  // General / availability: keep configured max on local fallback (or fail-open)
  if (rateLimitConfig.redisFailureMode.general === 'fail_open') {
    return Number.MAX_SAFE_INTEGER;
  }
  return max;
};

export default rateLimitConfig;
