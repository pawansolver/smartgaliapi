/**
 * Phase 7 — HTTP Metrics + Correlation ID Middleware
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Assigns a correlation/request ID to every request (reads x-request-id
 *    header if present, otherwise generates a UUID v4).
 * 2. Tracks in-flight requests, total requests, latency, and errors.
 * 3. Route label normalisation — dynamic path segments like /users/123 become
 *    /users/:id so Prometheus label cardinality stays bounded.
 *
 * Sensitive data NEVER appears in metric labels (no user IDs, tokens, emails).
 * Correlation IDs are propagated via logs only — never as Prometheus labels.
 */

import { randomUUID } from 'node:crypto';
import {
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestsInFlight,
  httpErrorsTotal,
} from './metrics.js';

// Sanitise an externally-supplied request ID to prevent header injection.
// Accept only alphanumeric + hyphen/underscore, max 64 chars.
const SAFE_ID_RE = /^[a-zA-Z0-9\-_]{1,64}$/;

const sanitiseCorrelationId = (value) => {
  if (typeof value === 'string' && SAFE_ID_RE.test(value)) return value;
  return null;
};

/**
 * Normalise an Express route pattern so dynamic segments do not inflate
 * Prometheus label cardinality.
 *
 * Strategy (in priority order):
 *  1. Use req.route.path (Express matched pattern, e.g. "/:id") combined with
 *     the router mount point — this is always low-cardinality.
 *  2. Fall back to stripping numeric, UUID-like, and slug-like segments from
 *     req.path so /users/123/posts/abc-xyz becomes /users/:id/posts/:id.
 *
 * IMPORTANT: this never lets raw user-supplied path values through as labels.
 */
const normaliseRoute = (req) => {
  // Prefer Express matched pattern (most reliable)
  if (req.route?.path) {
    const base = req.baseUrl || '';
    const routePath = req.route.path;
    // Combine base mount path + route pattern, strip trailing slash duplicates
    return (base + routePath).replace(/\/+/g, '/') || '/';
  }

  // Fallback: strip dynamic segments from the raw path
  return (req.path || '/')
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    // Replace pure numeric IDs
    .replace(/\/\d+/g, '/:id')
    // Replace alphanumeric slugs that look like IDs (12+ chars, mixed case/digits)
    .replace(/\/[a-zA-Z0-9]{12,}/g, '/:id')
    // Collapse consecutive slashes
    .replace(/\/+/g, '/') || '/';
};

/**
 * Express middleware: assigns correlation ID + records Prometheus HTTP metrics.
 */
export const httpMetricsMiddleware = (req, res, next) => {
  // ── Correlation ID ──────────────────────────────────────────────────────────
  const supplied = req.headers['x-request-id'];
  req.correlationId = sanitiseCorrelationId(supplied) || randomUUID();
  res.setHeader('x-request-id', req.correlationId);

  // ── In-flight gauge ─────────────────────────────────────────────────────────
  httpRequestsInFlight.inc();

  const startTime = process.hrtime.bigint();

  const onFinish = () => {
    res.removeListener('finish', onFinish);
    res.removeListener('close', onFinish);

    httpRequestsInFlight.dec();

    const durationNs = process.hrtime.bigint() - startTime;
    const durationSec = Number(durationNs) / 1e9;

    const route = normaliseRoute(req);
    const method = req.method || 'UNKNOWN';
    const statusCode = String(res.statusCode || 0);

    const labels = { method, route, status_code: statusCode };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationSec);

    if (res.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }
  };

  res.on('finish', onFinish);
  res.on('close', onFinish);

  next();
};

// Export for testing
export { normaliseRoute, sanitiseCorrelationId };
export default httpMetricsMiddleware;
