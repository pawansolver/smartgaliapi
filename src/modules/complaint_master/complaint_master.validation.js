import Joi from 'joi';

export const createCategorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]+$/).max(100).optional(),
  description: Joi.string().trim().max(1000).allow('', null).optional(),
  icon: Joi.string().trim().max(100).allow('', null).optional(),
  display_order: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true),
});

export const updateCategorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]+$/).max(100).optional(),
  description: Joi.string().trim().max(1000).allow('', null).optional(),
  icon: Joi.string().trim().max(100).allow('', null).optional(),
  display_order: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

export const createSubCategorySchema = Joi.object({
  category_id: Joi.number().integer().positive().required(),
  name: Joi.string().trim().min(2).max(100).required(),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]+$/).max(100).optional(),
  description: Joi.string().trim().max(1000).allow('', null).optional(),
  display_order: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true),
});

export const updateSubCategorySchema = Joi.object({
  category_id: Joi.number().integer().positive().optional(),
  name: Joi.string().trim().min(2).max(100).optional(),
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]+$/).max(100).optional(),
  description: Joi.string().trim().max(1000).allow('', null).optional(),
  display_order: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

export const createLocationTypeSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  code: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]+$/).max(100).optional(),
  description: Joi.string().trim().max(1000).allow('', null).optional(),
  icon: Joi.string().trim().max(100).allow('', null).optional(),
  display_order: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true),
});

export const updateLocationTypeSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  code: Joi.string().trim().lowercase().pattern(/^[a-z0-9_-]+$/).max(100).optional(),
  description: Joi.string().trim().max(1000).allow('', null).optional(),
  icon: Joi.string().trim().max(100).allow('', null).optional(),
  display_order: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

export const toggleStatusSchema = Joi.object({
  is_active: Joi.boolean().required(),
});

export const reorderMasterSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      id: Joi.number().integer().positive().required(),
      display_order: Joi.number().integer().min(0).required(),
    })
  ).min(1).required(),
});
