import Joi from 'joi';

export const requestAccessSchema = Joi.object({
  service_id: Joi.number().integer().positive().required(),
  society_id: Joi.number().integer().positive().required(),
  notes: Joi.string().max(1000).allow(null, '').optional(),
});

export const reviewActionSchema = Joi.object({
  reason: Joi.string().max(1000).optional(),
});

export const rejectActionSchema = Joi.object({
  reason: Joi.string().max(1000).required().messages({
    'any.required': 'Rejection reason is mandatory when rejecting a provider request.',
    'string.empty': 'Rejection reason cannot be empty.',
  }),
});

export const queryAccessSchema = Joi.object({
  society_id: Joi.number().integer().positive().optional(),
  service_id: Joi.number().integer().positive().optional(),
  provider_id: Joi.number().integer().positive().optional(),
  status: Joi.string().valid('REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'REVOKED').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
