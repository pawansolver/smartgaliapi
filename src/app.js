import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import routes from './routes/index.js';
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
    const isLocalDevelopment = !env.isProduction &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin);
    if (isLocalDevelopment || env.corsOrigins.includes(normalizedOrigin)) {
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
app.use(express.json()); // Parse JSON payloads
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded payloads
app.use(morgan(env.isProduction ? 'combined' : 'dev')); // HTTP request logger

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
