import { normalizeMediaPayload } from './mediaUrl.js';

/**
 * Standardize API responses
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Response message
 * @param {Object|null} data - Response payload
 * @param {Object|null} pagination - Pagination metadata (total, page, limit, totalPages)
 */
export const successResponse = (res, statusCode = 200, message = 'Success', data = null, pagination = null) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data: normalizeMediaPayload(data),
    ...(pagination ? { pagination } : {}),
  });
};

/**
 * Standardize API error responses
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Object|null} errors - Detailed validation/error object
 */
export const errorResponse = (res, statusCode = 500, message = 'Internal Server Error', errors = null) => {
  const response = {
    success: false,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};
