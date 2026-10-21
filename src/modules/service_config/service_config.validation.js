import Joi from 'joi';

export const masterItemSchema = Joi.object({
  code: Joi.string().trim().uppercase().max(50).required(),
  name: Joi.string().trim().max(100).optional(),
  label: Joi.string().trim().max(100).optional(),
  description: Joi.string().trim().max(500).allow(null, '').optional(),
  pricing_model_code: Joi.string().trim().max(50).optional(),
  minutes: Joi.number().integer().min(0).optional(),
  duration_days: Joi.number().integer().min(0).optional(),
  radius_km: Joi.number().min(0).optional(),
  capacity: Joi.number().integer().min(1).optional(),
  display_order: Joi.number().integer().default(0),
  is_active: Joi.boolean().default(true),
  remark: Joi.string().trim().max(255).allow(null, '').optional(),
}).or('name', 'label');

export const updateMasterItemSchema = Joi.object({
  name: Joi.string().trim().max(100).optional(),
  label: Joi.string().trim().max(100).optional(),
  description: Joi.string().trim().max(500).allow(null, '').optional(),
  pricing_model_code: Joi.string().trim().max(50).optional(),
  minutes: Joi.number().integer().min(0).optional(),
  duration_days: Joi.number().integer().min(0).optional(),
  radius_km: Joi.number().min(0).optional(),
  capacity: Joi.number().integer().min(1).optional(),
  display_order: Joi.number().integer().optional(),
  is_active: Joi.boolean().optional(),
  remark: Joi.string().trim().max(255).allow(null, '').optional(),
});

export const toggleMasterStatusSchema = Joi.object({
  is_active: Joi.boolean().required(),
  remark: Joi.string().trim().max(255).allow(null, '').optional(),
});
