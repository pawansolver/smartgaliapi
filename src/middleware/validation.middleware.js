/**
 * Generic Request Validation Middleware
 * ─────────────────────────────────────────────────────────────────────────────
 * Joi Schema Validation for Express HTTP requests (Body, Query, Params).
 * Normalizes input, strips unknown keys, and returns standard 422 error details.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { errorResponse } from '../utils/response.js';

/**
 * Validate req.body against a Joi schema
 */
export const validateBody = (schema) => (req, res, next) => {
  if (!schema) return next();
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    return errorResponse(res, 422, 'Validation failed', error.details.map((item) => item.message));
  }
  req.body = value;
  return next();
};

/**
 * Validate req.query against a Joi schema
 */
export const validateQuery = (schema) => (req, res, next) => {
  if (!schema) return next();
  const { error, value } = schema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    return errorResponse(res, 422, 'Validation failed', error.details.map((item) => item.message));
  }
  req.query = value;
  return next();
};

/**
 * Validate req.params against a Joi schema
 */
export const validateParams = (schema) => (req, res, next) => {
  if (!schema) return next();
  const { error, value } = schema.validate(req.params, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    return errorResponse(res, 422, 'Validation failed', error.details.map((item) => item.message));
  }
  req.params = value;
  return next();
};

/**
 * Multi-source composite validator for params, query, and body
 */
export const validate = (schemas = {}) => (req, res, next) => {
  for (const source of ['params', 'query', 'body']) {
    if (!schemas[source]) continue;
    const { error, value } = schemas[source].validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      return errorResponse(res, 422, 'Validation failed', error.details.map((item) => item.message));
    }
    req[source] = value;
  }
  return next();
};

export default {
  validateBody,
  validateQuery,
  validateParams,
  validate,
};
