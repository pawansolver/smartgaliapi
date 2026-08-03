import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import env from '../../config/env.js';

const TTL_PATTERN = /^(\d+)(s|m|h|d)$/;
const MULTIPLIERS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export const ttlToMs = (ttl) => {
  if (typeof ttl === 'number' && Number.isFinite(ttl) && ttl > 0) return ttl * 1000;
  const match = String(ttl).match(TTL_PATTERN);
  if (!match) throw new Error(`Invalid token TTL "${ttl}". Use a positive number of seconds or <number>s|m|h|d.`);
  return Number(match[1]) * MULTIPLIERS[match[2]];
};

export const hashValue = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

export const hashRefreshToken = (token) =>
  crypto.createHmac('sha256', env.auth.refreshSecret).update(token).digest('hex');

export const generateOtp = () => String(crypto.randomInt(100000, 1_000_000));

export const issueAccessToken = (user) => jwt.sign({
  id: user.userId,
  userId: user.userId,
  sub: String(user.userId),
  role: user.userRole || 'resident',
  email: user.email,
  phone: user.phone,
  type: 'access',
}, env.jwt.secret, { expiresIn: env.auth.accessTtl });

export const issueSessionToken = ({ subject, purpose, jti }) => jwt.sign({
  sub: String(subject),
  purpose,
  type: 'auth_session',
  jti,
}, env.jwt.secret, { expiresIn: env.auth.sessionTtl });

export const verifySessionToken = (token, purpose) => {
  const payload = jwt.verify(token, env.jwt.secret);
  if (payload.type !== 'auth_session' || payload.purpose !== purpose || !payload.jti) {
    const error = new Error('Invalid or expired session token.');
    error.statusCode = 401;
    throw error;
  }
  return payload;
};

export const newRefreshToken = () => crypto.randomBytes(48).toString('base64url');

export const expiresAt = (ttl) => new Date(Date.now() + ttlToMs(ttl));
