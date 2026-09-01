/**
 * Phase 7 — Health Check Endpoints
 * ─────────────────────────────────────────────────────────────────────────────
 * GET /health/live   — Liveness: is the process alive?
 * GET /health/ready  — Readiness: are critical dependencies reachable?
 *
 * Response schema:
 *   { status: "ok" | "degraded" | "error", checks: { db, redis, queue } }
 *
 * HTTP status:
 *   200 — ok or degraded (process can serve traffic, some deps optional)
 *   503 — error (critical dependency unreachable)
 *
 * Nothing sensitive is exposed: no connection strings, credentials, or
 * internal stack traces.
 */

import express from 'express';
import sequelize from '../config/db.js';
import { getCacheClient } from '../monitoring/redisMetrics.js';
import { getChatQueueHealth } from '../infrastructure/queues/queues.js';

const router = express.Router();

// ── Liveness ──────────────────────────────────────────────────────────────────
// Only confirms the Node.js process is responsive. Never checks external deps.
router.get('/live', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Readiness ─────────────────────────────────────────────────────────────────
router.get('/ready', async (_req, res) => {
  const checks = {};
  let critical = false;

  // 1. MySQL / Sequelize
  try {
    await Promise.race([
      sequelize.authenticate(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    checks.db = 'ok';
  } catch (err) {
    checks.db = 'error';
    critical = true;
  }

  // 2. Redis
  try {
    const client = getCacheClient();
    if (!client) {
      checks.redis = 'unavailable';
    } else {
      await Promise.race([
        client.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
      checks.redis = 'ok';
    }
  } catch {
    checks.redis = 'error';
    // Redis is optional for HTTP API (degrades gracefully) — not critical
  }

  // 3. BullMQ queue
  try {
    await Promise.race([
      getChatQueueHealth(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    checks.queue = 'ok';
  } catch {
    checks.queue = 'unavailable';
    // BullMQ is optional on API (workers are separate) — not critical
  }

  const status = critical ? 'error' : 'ok';
  const httpStatus = critical ? 503 : 200;

  res.status(httpStatus).json({ status, checks, timestamp: new Date().toISOString() });
});

export default router;
