import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { errorResponse } from '../utils/response.js';
import User from '../modules/user/user.model.js';

/**
 * Safely check if a user possesses exclusive Super Administrator authority
 * (e.g. 'super_admin', 'superadmin').
 * Strictly excludes standard operational 'admin' (R002) and community/resident roles.
 */
export const isSuperAdminUser = (user) => {
  if (!user) return false;
  const role = String(user.userRole || user.role || '').toLowerCase().trim();
  return role === 'super_admin' || role === 'superadmin';
};

/**
 * Safely check if a user possesses global platform-level administrator authority
 * (e.g. 'super_admin', 'superadmin', 'admin') for legitimate shared operational duties.
 */
export const isGlobalAdminUser = (user) => {
  if (!user) return false;
  const role = String(user.userRole || user.role || '').toLowerCase().trim();
  return role === 'super_admin' || role === 'superadmin' || role === 'admin';
};

/**
 * Middleware requiring exclusive Super Administrator privileges (PRD R001 System Administration).
 */
export const requireSuperAdmin = (req, res, next) => {
  if (!req.user || !isSuperAdminUser(req.user)) {
    return errorResponse(res, 403, 'Super Administrator privileges required.');
  }
  return next();
};

/**
 * Middleware requiring global platform admin or super admin privileges (Shared operational duties)
 */
export const requireGlobalAdmin = (req, res, next) => {
  if (!req.user || !isGlobalAdminUser(req.user)) {
    return errorResponse(res, 403, 'Administrator privileges required.');
  }
  return next();
};

/**
 * Middleware to protect routes using JWT
 */
export const createAuthenticate = ({
  verifyToken = (token) => jwt.verify(token, env.jwt.secret),
  findUser = (options) => User.findOne(options),
} = {}) => async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, 401, 'Access denied. No token provided.');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    const userId = decoded.id ?? decoded.userId ?? decoded.sub;
    if (!userId) {
      return errorResponse(res, 401, 'Invalid token.');
    }

    const user = await findUser({
      where: {
        userId,
        is_deleted: false,
        is_active: true,
        status: 'active',
      },
      attributes: ['userId', 'userRole'],
    });
    if (!user) {
      return errorResponse(res, 401, 'Account is unavailable.');
    }

    const { userRole: tokenUserRole, ...decodedClaims } = decoded;
    const currentUserRole = user.userRole ?? tokenUserRole;
    req.user = {
      ...decodedClaims,
      id: userId,
      ...(currentUserRole != null ? { userRole: currentUserRole } : {}),
    }; // Normalize identity and use the current database-backed app role.
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, 401, 'Token expired.');
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
      return errorResponse(res, 401, 'Invalid token.');
    }
    return next(error);
  }
};

export const authenticate = createAuthenticate();

/**
 * Parses a valid bearer token when present, while allowing anonymous reads.
 * Invalid/expired tokens are rejected instead of silently downgrading to anonymous.
 */
export const optionalAuthenticate = async (req, res, next) => {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
};
