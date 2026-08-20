/**
 * Phase 7 — Redis Metrics Instrumentation Helpers
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides:
 *  - trackRedis(operation, fn) — wraps any Redis call with metric tracking
 *  - getCacheClient()          — exposes the cache client for health checks
 *    (needed by health.routes.js without creating a circular dependency)
 *
 * Never exposes Redis keys, values, passwords, or connection strings.
 */

import {
  redisOperationsTotal,
  redisOperationErrors,
  redisOperationDuration,
} from './metrics.js';

// Lazy reference to the cache client — set during Redis initialisation.
let _cacheClient = null;

/**
 * Called from config/redis.js after Redis clients are created.
 * Avoids circular imports between redis.js → metrics → redis.js.
 */
export const setCacheClientRef = (client) => {
  _cacheClient = client;
};

/**
 * Returns the cache Redis client for health checks (no credentials exposed).
 */
export const getCacheClient = () => _cacheClient;

/**
 * Wrap any async Redis operation with Prometheus instrumentation.
 *
 * @param {string} operation - Low-cardinality label (e.g. 'get', 'set', 'ping')
 * @param {() => Promise<any>} fn - The Redis call to execute
 * @returns Promise<any>
 *
 * @example
 *   const value = await trackRedis('get', () => cacheClient.get(key));
 */
export const trackRedis = async (operation, fn) => {
  const label = { operation };
  const startTime = process.hrtime.bigint();
  redisOperationsTotal.inc(label);
  try {
    const result = await fn();
    const durationSec = Number(process.hrtime.bigint() - startTime) / 1e9;
    redisOperationDuration.observe(label, durationSec);
    return result;
  } catch (err) {
    const durationSec = Number(process.hrtime.bigint() - startTime) / 1e9;
    redisOperationDuration.observe(label, durationSec);
    redisOperationErrors.inc(label);
    throw err;
  }
};

export default { trackRedis, getCacheClient, setCacheClientRef };
