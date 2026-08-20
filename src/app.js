import express from 'express';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import routes from './routes/index.js';
import registry from './monitoring/metrics.js';
import { httpMetricsMiddleware } from './monitoring/httpMetrics.middleware.js';
import healthRoutes from './monitoring/health.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { setupSwagger } from './swagger.js';
import env from './config/env.js';

// Initialize express app
const app = express();
app.set('trust proxy', env.trustProxy);

// Global Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
})); // Security headers
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/+$/, '');
    // Flutter Web uses a random localhost port during development. Loopback
    // origins remain local to the developer's machine and must work even when
    // that browser build calls the deployed API.
    const isLoopbackOrigin =
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin);
    if (isLoopbackOrigin || env.corsOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    const error = new Error('Origin is not allowed by CORS.');
    error.statusCode = 403;
    callback(error);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
})); // Enable CORS
// Skip JSON / urlencoded parsers for multipart requests (file uploads).
// If these parsers run on a multipart body they interfere with multer's
// stream reader, leaving req.file undefined even when the file was sent.
const isMultipart = (req) => (req.headers['content-type'] || '').startsWith('multipart/');
app.use((req, res, next) => isMultipart(req) ? next() : express.json()(req, res, next));
app.use((req, res, next) => isMultipart(req) ? next() : express.urlencoded({ extended: true })(req, res, next));
app.use(morgan(env.isProduction ? 'combined' : 'dev')); // HTTP request logger

// ── Phase 7: HTTP metrics middleware (correlation ID + Prometheus tracking) ──
app.use(httpMetricsMiddleware);

// ── Phase 7: Health endpoints (excluded from rate limiter and metrics) ────────
// GET /health/live  — liveness probe
// GET /health/ready — readiness probe (DB + Redis + Queue)
app.use('/health', healthRoutes);

// ── Phase 7: Prometheus /metrics endpoint ─────────────────────────────────────
// Security safeguards:
//  1. Metrics token check in production (METRICS_TOKEN env var)
//  2. Only bind to localhost in production if running behind a proxy
//  3. Excluded from general API rate limiter (mounted before /api/v1)
app.get('/metrics', async (req, res) => {
  // In production, require a bearer token to prevent public metric exposure.
  if (env.isProduction) {
    const metricsToken = process.env.METRICS_TOKEN;
    if (metricsToken && metricsToken.length >= 16) {
      const authHeader = req.headers['authorization'] || '';
      const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (provided !== metricsToken) {
        return res.status(401).end('Unauthorized');
      }
    }
    // If METRICS_TOKEN is not set in production, block the endpoint entirely
    // to prevent accidental public exposure.
    if (!metricsToken) {
      return res.status(403).end('Forbidden: set METRICS_TOKEN to enable this endpoint');
    }
  }
  try {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  } catch (err) {
    res.status(500).end(String(err));
  }
});

// Setup Swagger UI Documentation
setupSwagger(app);

// UPLOADS_PATH must point to persistent storage in production.
app.use('/uploads', express.static(env.uploadsPath, {
  dotfiles: 'deny',
  fallthrough: false,
  index: false,
  maxAge: env.isProduction ? '1d' : 0,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
  },
}));

// Health Check Route (Stops Render's 404 logs on GET /)
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'SmartGali API is running' });
});

// API Routes
app.use('/api/v1', routes);

// 404 Route Handler
app.use(notFoundHandler);

// Global Error Handler (must be the last middleware)
app.use(errorHandler);

export default app;

