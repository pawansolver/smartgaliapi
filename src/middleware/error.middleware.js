import { errorResponse } from '../utils/response.js';
import env from '../config/env.js';
import multer from 'multer';

/**
 * Global error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log error for debugging in development
  if (env.nodeEnv === 'development') {
    console.error(`[Error] ${err.message}`, err.stack);
  }

  // Handle specific known errors (e.g., Sequelize, JWT)
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    if (env.nodeEnv === 'development') {
      console.error('[Sequelize Error Details]:', JSON.stringify(err.errors, null, 2));
    }
    const errors = err.errors.map(e => e.message);
    return errorResponse(res, 400, 'Validation Error', errors);
  }

  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 401, 'Invalid token.');
  }

  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 401, 'Token expired.');
  }

  if (err instanceof multer.MulterError) {
    const isAttachment = err.field === 'attachment';
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? (isAttachment ? 'Attachment exceeds the 100 MB upload limit.' : 'Image must be 5 MB or smaller.')
      : `Invalid file upload: ${err.message}`;
    return errorResponse(res, 400, message);
  }

  if (['INVALID_IMAGE_TYPE', 'INVALID_ATTACHMENT_TYPE', 'INVALID_ATTACHMENT_CONTENT', 'ATTACHMENT_TOO_LARGE'].includes(err.code)) {
    return errorResponse(res, 400, err.message);
  }

  // Never leak stack traces or internal details to clients in production
  return errorResponse(res, statusCode, message, env.isProduction ? undefined : err.stack);
};

/**
 * Catch 404 Not Found errors
 */
export const notFoundHandler = (req, res, next) => {
  const err = new Error(`Route ${req.originalUrl} not found`);
  err.statusCode = 404;
  next(err);
};

