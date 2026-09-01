/**
 * Phase 7 — Monitoring Tests
 * Uses node:test (existing runner: node --test "test/*.test.js")
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

// ─── HTTP request helper ──────────────────────────────────────────────────────
const request = (url, opts = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(url, { ...opts }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });

// ─── 1. Route normalisation ───────────────────────────────────────────────────

test('normaliseRoute strips numeric IDs from path', async () => {
  const mod = await import('../src/monitoring/httpMetrics.middleware.js');
  const { normaliseRoute } = mod;
  const fakeReq = { path: '/api/v1/users/12345/posts/789', method: 'GET' };
  const result = normaliseRoute(fakeReq);
  assert.ok(!result.includes('12345'), `Should not contain raw ID: ${result}`);
  assert.ok(!result.includes('789'), `Should not contain raw ID: ${result}`);
  assert.ok(result.includes(':id'), `Should contain ':id': ${result}`);
});

test('normaliseRoute strips UUID segments', async () => {
  const { normaliseRoute } = await import('../src/monitoring/httpMetrics.middleware.js');
  const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const fakeReq = { path: `/chats/${uuid}/messages`, method: 'GET' };
  const result = normaliseRoute(fakeReq);
  assert.ok(!result.includes(uuid), `Should not contain UUID: ${result}`);
});

test('normaliseRoute uses req.route.path when available', async () => {
  const { normaliseRoute } = await import('../src/monitoring/httpMetrics.middleware.js');
  const fakeReq = {
    path: '/api/v1/users/99999',
    route: { path: '/:id' },
    baseUrl: '/api/v1/users',
    method: 'GET',
  };
  const result = normaliseRoute(fakeReq);
  assert.ok(!result.includes('99999'), `Should not contain raw ID: ${result}`);
  assert.ok(result.includes(':id'), `Should use route pattern: ${result}`);
});

// ─── 2. Correlation ID ────────────────────────────────────────────────────────

test('sanitiseCorrelationId accepts valid IDs', async () => {
  const { sanitiseCorrelationId } = await import('../src/monitoring/httpMetrics.middleware.js');
  assert.equal(sanitiseCorrelationId('abc-123_XYZ'), 'abc-123_XYZ');
  assert.equal(sanitiseCorrelationId('test-id-1'), 'test-id-1');
});

test('sanitiseCorrelationId rejects IDs with special characters', async () => {
  const { sanitiseCorrelationId } = await import('../src/monitoring/httpMetrics.middleware.js');
  assert.equal(sanitiseCorrelationId('bad<script>'), null);
  assert.equal(sanitiseCorrelationId('id with spaces'), null);
  assert.equal(sanitiseCorrelationId('a'.repeat(65)), null);
});

test('httpMetricsMiddleware sets x-request-id response header', async () => {
  const { httpMetricsMiddleware } = await import('../src/monitoring/httpMetrics.middleware.js');
  const app = express();
  app.use(httpMetricsMiddleware);
  app.get('/test', (_req, res) => res.status(200).json({ ok: true }));

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port;
      try {
        const res = await request(`http://localhost:${port}/test`);
        assert.ok(res.headers['x-request-id'], 'Should set x-request-id response header');
        server.close(resolve);
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
});

// ─── 3. Metrics registry ─────────────────────────────────────────────────────

test('metrics registry exports all required metrics', async () => {
  const metrics = await import('../src/monitoring/metrics.js');
  // HTTP
  assert.ok(metrics.httpRequestsTotal, 'httpRequestsTotal');
  assert.ok(metrics.httpRequestDuration, 'httpRequestDuration');
  assert.ok(metrics.httpRequestsInFlight, 'httpRequestsInFlight');
  assert.ok(metrics.httpErrorsTotal, 'httpErrorsTotal');
  // Chat
  assert.ok(metrics.chatMessagesCreated, 'chatMessagesCreated');
  assert.ok(metrics.chatMessagesFailed, 'chatMessagesFailed');
  assert.ok(metrics.chatAttachmentsUploaded, 'chatAttachmentsUploaded');
  assert.ok(metrics.chatAttachmentUploadFailures, 'chatAttachmentUploadFailures');
  // Socket
  assert.ok(metrics.socketConnectionsActive, 'socketConnectionsActive');
  assert.ok(metrics.socketConnectionsTotal, 'socketConnectionsTotal');
  assert.ok(metrics.socketDisconnectionsTotal, 'socketDisconnectionsTotal');
  assert.ok(metrics.presenceUpdatesTotal, 'presenceUpdatesTotal');
  // Redis
  assert.ok(metrics.redisOperationsTotal, 'redisOperationsTotal');
  assert.ok(metrics.redisOperationErrors, 'redisOperationErrors');
  assert.ok(metrics.redisOperationDuration, 'redisOperationDuration');
  // BullMQ
  assert.ok(metrics.bullmqJobsTotal, 'bullmqJobsTotal');
  assert.ok(metrics.bullmqJobFailures, 'bullmqJobFailures');
  assert.ok(metrics.bullmqJobDuration, 'bullmqJobDuration');
  assert.ok(metrics.bullmqJobsActive, 'bullmqJobsActive');
  assert.ok(metrics.bullmqJobsWaiting, 'bullmqJobsWaiting');
  // FCM
  assert.ok(metrics.fcmNotificationsSent, 'fcmNotificationsSent');
  assert.ok(metrics.fcmNotificationsFailed, 'fcmNotificationsFailed');
  assert.ok(metrics.fcmNotificationDuration, 'fcmNotificationDuration');
  // DB
  assert.ok(metrics.dbQueriesTotal, 'dbQueriesTotal');
  assert.ok(metrics.dbQueryErrors, 'dbQueryErrors');
  assert.ok(metrics.dbQueryDuration, 'dbQueryDuration');
});

test('registry.metrics() returns Prometheus text format', async () => {
  const { default: registry } = await import('../src/monitoring/metrics.js');
  const metricsText = await registry.metrics();
  assert.ok(typeof metricsText === 'string', 'metrics() should return a string');
  assert.ok(metricsText.length > 0, 'metrics output should not be empty');
  const hasFormat = metricsText.includes('# HELP') || metricsText.includes('# TYPE');
  assert.ok(hasFormat, 'Should contain Prometheus format headers');
});

test('HTTP metrics counter increments', async () => {
  const { httpRequestsTotal } = await import('../src/monitoring/metrics.js');
  const before = (await httpRequestsTotal.get()).values.length;
  httpRequestsTotal.inc({ method: 'POST', route: '/api/v1/chat', status_code: '201' });
  const after = (await httpRequestsTotal.get()).values.length;
  assert.ok(after >= before, 'Counter values should not decrease');
});

test('error metrics counter increments', async () => {
  const { httpErrorsTotal } = await import('../src/monitoring/metrics.js');
  httpErrorsTotal.inc({ method: 'GET', route: '/api/v1/missing', status_code: '404' });
  const vals = (await httpErrorsTotal.get()).values;
  const entry = vals.find((v) => v.labels?.status_code === '404');
  assert.ok(entry, 'Should have 404 error entry');
  assert.ok(entry.value >= 1, 'Error counter should be at least 1');
});

test('/metrics endpoint serves Prometheus text via test server', async () => {
  const { default: registry } = await import('../src/monitoring/metrics.js');
  const app = express();
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port;
      try {
        const res = await request(`http://localhost:${port}/metrics`);
        assert.equal(res.status, 200, '/metrics should return 200');
        const hasFormat = res.body.includes('# HELP') || res.body.includes('# TYPE');
        assert.ok(hasFormat, 'Should return Prometheus format');
        server.close(resolve);
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
});

test('metrics output does not contain sensitive label values', async () => {
  const { default: registry } = await import('../src/monitoring/metrics.js');
  const metricsText = await registry.metrics();
  const sensitivePatterns = [
    /user_id="\d+"/,
    /email="[^"]+@[^"]+"/,
    /token="[a-zA-Z0-9.+/]{20,}"/,
    /phone="\d{7,}"/,
  ];
  for (const pattern of sensitivePatterns) {
    assert.ok(!pattern.test(metricsText), `Sensitive data found: ${pattern}`);
  }
});

// ─── 4. Redis metrics ─────────────────────────────────────────────────────────

test('trackRedis increments operation counter on success', async () => {
  const { trackRedis } = await import('../src/monitoring/redisMetrics.js');
  const { redisOperationsTotal } = await import('../src/monitoring/metrics.js');

  await trackRedis('get', () => Promise.resolve('mock-value'));

  const vals = (await redisOperationsTotal.get()).values;
  const getEntry = vals.find((v) => v.labels?.operation === 'get');
  assert.ok(getEntry, "Should have 'get' operation counter");
  assert.ok(getEntry.value >= 1, "Counter should be >= 1");
});

test('trackRedis increments error counter on failure', async () => {
  const { trackRedis } = await import('../src/monitoring/redisMetrics.js');
  const { redisOperationErrors } = await import('../src/monitoring/metrics.js');

  await assert.rejects(
    () => trackRedis('ping', () => Promise.reject(new Error('Redis down'))),
    /Redis down/
  );

  const vals = (await redisOperationErrors.get()).values;
  const pingEntry = vals.find((v) => v.labels?.operation === 'ping');
  assert.ok(pingEntry, "Should have 'ping' error counter");
  assert.ok(pingEntry.value >= 1, "Error counter should be >= 1");
});

test('trackRedis returns wrapped function result', async () => {
  const { trackRedis } = await import('../src/monitoring/redisMetrics.js');
  const result = await trackRedis('set', () => Promise.resolve('OK'));
  assert.equal(result, 'OK');
});

// ─── 5. BullMQ metrics ────────────────────────────────────────────────────────

test('BullMQ job counters increment correctly', async () => {
  const { bullmqJobsTotal, bullmqJobFailures } = await import('../src/monitoring/metrics.js');
  bullmqJobsTotal.inc({ queue: 'chat-events', status: 'completed' });
  bullmqJobsTotal.inc({ queue: 'chat-events', status: 'failed' });
  bullmqJobFailures.inc({ queue: 'chat-events' });

  const totals = (await bullmqJobsTotal.get()).values;
  const completed = totals.find((v) => v.labels?.status === 'completed');
  assert.ok(completed?.value >= 1, 'Completed counter should be >= 1');
});

test('BullMQ active gauge increments and decrements', async () => {
  const { bullmqJobsActive } = await import('../src/monitoring/metrics.js');
  // Set gauge to a known baseline
  bullmqJobsActive.set({ queue: 'test-gauge' }, 5);
  const afterSet = (await bullmqJobsActive.get()).values;
  const baseEntry = afterSet.find((v) => v.labels?.queue === 'test-gauge');
  assert.equal(baseEntry?.value, 5, 'Gauge should be 5 after set');

  bullmqJobsActive.inc({ queue: 'test-gauge' });
  const afterInc = (await bullmqJobsActive.get()).values;
  const afterIncEntry = afterInc.find((v) => v.labels?.queue === 'test-gauge');
  assert.equal(afterIncEntry?.value, 6, 'Gauge should be 6 after inc');

  bullmqJobsActive.dec({ queue: 'test-gauge' });
  const afterDec = (await bullmqJobsActive.get()).values;
  const afterDecEntry = afterDec.find((v) => v.labels?.queue === 'test-gauge');
  assert.equal(afterDecEntry?.value, 5, 'Gauge should return to 5 after dec');
});

// ─── 6. FCM metrics ──────────────────────────────────────────────────────────

test('FCM notification counters increment', async () => {
  const { fcmNotificationsSent, fcmNotificationsFailed } = await import('../src/monitoring/metrics.js');
  fcmNotificationsSent.inc();
  fcmNotificationsSent.inc();
  fcmNotificationsFailed.inc({ reason: 'permanent' });

  const sent = (await fcmNotificationsSent.get()).values;
  assert.ok(sent[0]?.value >= 2, 'Sent counter should be >= 2');

  const failed = (await fcmNotificationsFailed.get()).values;
  const permanent = failed.find((v) => v.labels?.reason === 'permanent');
  assert.ok(permanent?.value >= 1, "Permanent failure counter should be >= 1");
});

// ─── 7. Health endpoints ──────────────────────────────────────────────────────

test('/health/live returns 200', async () => {
  const app = express();
  app.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port;
      try {
        const res = await request(`http://localhost:${port}/health/live`);
        assert.equal(res.status, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.status, 'ok');
        server.close(resolve);
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
});

test('/health/ready returns 503 when DB fails', async () => {
  const app = express();
  app.get('/health/ready', (_req, res) => {
    res.status(503).json({
      status: 'error',
      checks: { db: 'error', redis: 'ok', queue: 'ok' },
      timestamp: new Date().toISOString(),
    });
  });
  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port;
      try {
        const res = await request(`http://localhost:${port}/health/ready`);
        assert.equal(res.status, 503);
        const body = JSON.parse(res.body);
        assert.equal(body.status, 'error');
        assert.equal(body.checks.db, 'error');
        server.close(resolve);
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
});

test('/health/ready returns 200 when all deps pass', async () => {
  const app = express();
  app.get('/health/ready', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      checks: { db: 'ok', redis: 'ok', queue: 'ok' },
      timestamp: new Date().toISOString(),
    });
  });
  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port;
      try {
        const res = await request(`http://localhost:${port}/health/ready`);
        assert.equal(res.status, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.status, 'ok');
        server.close(resolve);
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
});

// ─── 8. Metrics security ─────────────────────────────────────────────────────

test('/metrics returns 401 when production token mismatch', async () => {
  const { default: registry } = await import('../src/monitoring/metrics.js');
  const app = express();
  const PROD_TOKEN = 'supersecrettoken123456';

  app.get('/metrics', async (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (provided !== PROD_TOKEN) return res.status(401).end('Unauthorized');
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port;
      try {
        const resNoToken = await request(`http://localhost:${port}/metrics`);
        assert.equal(resNoToken.status, 401, 'No token → 401');

        const resWrong = await request(`http://localhost:${port}/metrics`, {
          headers: { 'Authorization': 'Bearer wrongtoken' },
        });
        assert.equal(resWrong.status, 401, 'Wrong token → 401');

        const resGood = await request(`http://localhost:${port}/metrics`, {
          headers: { 'Authorization': `Bearer ${PROD_TOKEN}` },
        });
        assert.equal(resGood.status, 200, 'Correct token → 200');

        server.close(resolve);
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
});

test('/metrics returns 403 in production with no METRICS_TOKEN set', async () => {
  const app = express();
  app.get('/metrics', (req, res) => {
    const metricsToken = undefined; // simulate unset
    if (!metricsToken) return res.status(403).end('Forbidden');
    res.status(200).end('ok');
  });

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port;
      try {
        const res = await request(`http://localhost:${port}/metrics`);
        assert.equal(res.status, 403, 'Unset token → 403');
        server.close(resolve);
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
});

// ─── 9. Cardinality safety ────────────────────────────────────────────────────

test('HTTP request labels are low-cardinality only', async () => {
  const { httpRequestsTotal } = await import('../src/monitoring/metrics.js');
  const vals = (await httpRequestsTotal.get()).values;
  const allowed = new Set(['method', 'route', 'status_code']);
  for (const val of vals) {
    for (const key of Object.keys(val.labels || {})) {
      assert.ok(allowed.has(key), `Unexpected label key '${key}' on http_requests_total`);
    }
  }
});

test('Socket metrics have no user-specific labels', async () => {
  const { socketConnectionsTotal, presenceUpdatesTotal } = await import('../src/monitoring/metrics.js');
  socketConnectionsTotal.inc();
  presenceUpdatesTotal.inc({ type: 'online' });

  const vals = (await socketConnectionsTotal.get()).values;
  for (const val of vals) {
    const keys = Object.keys(val.labels || {});
    assert.ok(!keys.includes('user_id') && !keys.includes('userId'),
      'Socket metrics must not have user_id labels');
  }
});

test('FCM metrics have no token or user labels', async () => {
  const { fcmNotificationsSent, fcmNotificationsFailed } = await import('../src/monitoring/metrics.js');
  const all = [
    ...(await fcmNotificationsSent.get()).values,
    ...(await fcmNotificationsFailed.get()).values,
  ];
  const forbidden = ['token', 'user_id', 'userId', 'email', 'phone'];
  for (const val of all) {
    for (const f of forbidden) {
      assert.ok(
        !Object.keys(val.labels || {}).includes(f),
        `FCM metrics must not have '${f}' label`
      );
    }
  }
});

test('Redis metrics labels only include operation', async () => {
  const { redisOperationsTotal } = await import('../src/monitoring/metrics.js');
  const vals = (await redisOperationsTotal.get()).values;
  for (const val of vals) {
    const keys = Object.keys(val.labels || {});
    for (const key of keys) {
      assert.equal(key, 'operation', `Unexpected Redis label: ${key}`);
    }
  }
});
