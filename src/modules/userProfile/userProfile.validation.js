import Joi from 'joi';
import { errorResponse } from '../../utils/response.js';

// ─────────────────────────────────────────────
// Schema: Send OTP
// Accepts: phoneNumber and email
// ─────────────────────────────────────────────
export const sendOtpSchema = Joi.object({
  phoneNumber: Joi.string().required().messages({
    'any.required': 'phoneNumber is required.',
    'string.empty': 'phoneNumber cannot be empty.',
  }),
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    'string.email': 'email must be a valid email address.',
    'any.required': 'email is required.',
    'string.empty': 'email cannot be empty.',
  }),
});

// ─────────────────────────────────────────────
// Schema: Verify OTP
// ─────────────────────────────────────────────
export const verifyOtpSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    'string.email': 'email must be a valid email address.',
    'any.required': 'email is required.',
    'string.empty': 'email cannot be empty.',
  }),
  otp: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.length': 'otp must be exactly 6 digits.',
      'string.pattern.base': 'otp must contain only digits.',
      'any.required': 'otp is required.',
      'string.empty': 'otp cannot be empty.',
    }),
});

// ─────────────────────────────────────────────
// Middleware Factory
// Usage: validate(sendOtpSchema)
// ─────────────────────────────────────────────
export const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const details = error.details.map((d) => d.message);
    return errorResponse(res, 422, 'Validation failed', details);
  }
  next();
};
