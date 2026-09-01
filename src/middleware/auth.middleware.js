import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { errorResponse } from '../utils/response.js';
import User from '../modules/user/user.model.js';

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
