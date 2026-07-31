import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const port = Number(process.env.PORT || 3000);

const parseList = (value, fallback = []) =>
  (value ? value.split(',') : fallback)
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const parseTrustProxy = (value) => {
  if (!value) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
};

const localOrigin = `http://localhost:${port}`;
const jwtSecret = process.env.JWT_SECRET || 'fallback_secret';
const corsOrigins = parseList(process.env.CORS_ORIGINS, [
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

if (isProduction) {
  const missing = [
    ['JWT_SECRET', process.env.JWT_SECRET],
    ['DB_HOST', process.env.DB_HOST],
    ['DB_USER', process.env.DB_USER],
    ['DB_NAME', process.env.DB_NAME],
    ['CORS_ORIGINS', process.env.CORS_ORIGINS],
    ['PUBLIC_API_ORIGIN', process.env.PUBLIC_API_ORIGIN],
    ['PUBLIC_MEDIA_ORIGIN', process.env.PUBLIC_MEDIA_ORIGIN],
    ['UPLOADS_PATH', process.env.UPLOADS_PATH],
  ].filter(([, value]) => !value?.trim()).map(([name]) => name);

  if (missing.length || jwtSecret === 'fallback_secret') {
    throw new Error(`Invalid production configuration. Missing: ${missing.join(', ') || 'secure JWT_SECRET'}`);
  }
}

const env = {
  port,
  nodeEnv,
  isProduction,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'ecommerce_db',
  },
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  corsOrigins,
  publicApiOrigin: (process.env.PUBLIC_API_ORIGIN || localOrigin).replace(/\/+$/, ''),
  publicMediaOrigin: (process.env.PUBLIC_MEDIA_ORIGIN || process.env.PUBLIC_API_ORIGIN || localOrigin).replace(/\/+$/, ''),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  uploadsPath: path.resolve(process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads')),
};

export default env;
