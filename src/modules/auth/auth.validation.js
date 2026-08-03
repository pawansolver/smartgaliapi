import Joi from 'joi';
import { errorResponse } from '../../utils/response.js';

export const normalizeEmail = (value) => value.trim().toLowerCase();
export const normalizeMobile = (value) => {
  const digits = String(value).replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

const email = Joi.string().trim().email().max(255).custom((value) => normalizeEmail(value));
const mobile = Joi.string().trim().custom((value, helpers) => {
  const normalized = normalizeMobile(value);
  return /^[6-9]\d{9}$/.test(normalized) ? normalized : helpers.error('string.mobile');
}).messages({ 'string.mobile': 'mobile must be a valid 10-digit Indian mobile number.' });
const password = Joi.string()
  .min(8)
  .max(72)
  .pattern(/[a-z]/, 'lowercase letter')
  .pattern(/[A-Z]/, 'uppercase letter')
  .pattern(/[0-9]/, 'number')
  .pattern(/[^a-zA-Z0-9]/, 'special character');
const otp = Joi.string().pattern(/^\d{6}$/);
const identifier = Joi.string().trim().min(3).max(255);

export const signupSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  mobile: mobile.required(),
  email: email.required(),
});
export const verifySignupOtpSchema = Joi.object({ email: email.required(), otp: otp.required() });
export const createPasswordSchema = Joi.object({
  signupSessionToken: Joi.string().required(),
  password: password.required(),
});
export const signinSchema = Joi.object({ identifier: identifier.required(), password: Joi.string().required() });
export const forgotPasswordSchema = Joi.object({ identifier: identifier.required() });
export const verifyResetOtpSchema = Joi.object({ identifier: identifier.required(), otp: otp.required() });
export const resetPasswordSchema = Joi.object({
  resetToken: Joi.string().required(),
  password: password.required(),
});
export const refreshTokenSchema = Joi.object({ refreshToken: Joi.string().min(40).required() });
export const logoutSchema = refreshTokenSchema;
export const updateAuthProfileSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(120),
  email: email,
  bio: Joi.string().trim().max(500).allow('', null),
  avatarUrl: Joi.string().uri().allow('', null),
  locationName: Joi.string().trim().max(255).allow('', null),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
}).min(1);
export const deleteAuthAccountSchema = Joi.object({
  password: Joi.string().allow('', null),
  reason: Joi.string().trim().max(255).allow('', null),
  confirm: Joi.boolean().valid(true).required(),
});

export const validate = (schema) => (req, res, next) => {
  const { value, error } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    return errorResponse(res, 422, 'Validation failed', error.details.map(({ message }) => message));
  }
  req.body = value;
  return next();
};
