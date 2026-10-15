import Joi from 'joi';

export const createListingSchema = Joi.object({
  title: Joi.string().trim().min(3).max(255).required(),
  description: Joi.string().trim().max(5000).allow(null, '').optional(),
  price: Joi.number().min(0).max(9999999.99).allow(null).optional(),
  duration: Joi.string().trim().max(100).allow(null, '').optional(),
  category_id: Joi.number().integer().positive().allow(null).optional(),
  service_subcategory_id: Joi.number().integer().positive().allow(null).optional(),
  highlights: Joi.array().items(Joi.string().trim().max(255)).default([]),
  safe_terms: Joi.string().trim().max(2000).allow(null, '').optional(),
  images: Joi.array().items(Joi.string().uri().max(500)).default([]),
  is_available: Joi.boolean().default(true),
  provider_id: Joi.number().integer().positive().optional(), // Allowed for admin override
});

export const updateListingSchema = Joi.object({
  title: Joi.string().trim().min(3).max(255).optional(),
  description: Joi.string().trim().max(5000).allow(null, '').optional(),
  price: Joi.number().min(0).max(9999999.99).allow(null).optional(),
  duration: Joi.string().trim().max(100).allow(null, '').optional(),
  category_id: Joi.number().integer().positive().allow(null).optional(),
  service_subcategory_id: Joi.number().integer().positive().allow(null).optional(),
  highlights: Joi.array().items(Joi.string().trim().max(255)).optional(),
  safe_terms: Joi.string().trim().max(2000).allow(null, '').optional(),
  images: Joi.array().items(Joi.string().uri().max(500)).optional(),
  is_available: Joi.boolean().optional(),
});

export const moderateListingSchema = Joi.object({
  moderation_status: Joi.string().valid('approved', 'rejected', 'paused', 'active').required(),
  moderation_remarks: Joi.string().trim().max(1000).allow(null, '').optional(),
});

export const queryListingsSchema = Joi.object({
  category_id: Joi.number().integer().positive().optional(),
  service_subcategory_id: Joi.number().integer().positive().optional(),
  search: Joi.string().trim().max(100).allow(null, '').optional(),
  city: Joi.string().trim().max(100).allow(null, '').optional(),
  locality: Joi.string().trim().max(100).allow(null, '').optional(),
  pincode: Joi.string().trim().pattern(/^\d{6}$/).allow(null, '').optional(),
  min_price: Joi.number().min(0).optional(),
  max_price: Joi.number().min(0).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
