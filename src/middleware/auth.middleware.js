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
      attributes: ['userId'],
    });
    if (!user) {
      return errorResponse(res, 401, 'Account is unavailable.');
    }

    req.user = { ...decoded, id: userId }; // Normalize the ID used by protected controllers.
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
