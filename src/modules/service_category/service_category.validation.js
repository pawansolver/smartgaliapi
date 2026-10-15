import Joi from 'joi';

export const createCategorySchema = Joi.object({
  serviceCategoryName: Joi.string().trim().min(2).max(100).required(),
  serviceCategoryImage: Joi.string().allow(null, '').optional(),
  remark: Joi.string().trim().max(500).allow(null, '').optional(),
});

export const updateCategorySchema = Joi.object({
  serviceCategoryName: Joi.string().trim().min(2).max(100).optional(),
  serviceCategoryImage: Joi.string().allow(null, '').optional(),
  is_active: Joi.boolean().optional(),
  remark: Joi.string().trim().max(500).allow(null, '').optional(),
});

export const createSubcategorySchema = Joi.object({
  service_subcategory_name: Joi.string().trim().min(2).max(255).required(),
  service_subcategory_slug: Joi.string().trim().min(2).max(255).optional(),
  service_subcategory_image: Joi.string().allow(null, '').max(500).optional(),
  is_active: Joi.boolean().optional(),
  remark: Joi.string().trim().max(500).allow(null, '').optional(),
});

export const updateSubcategorySchema = Joi.object({
  service_subcategory_name: Joi.string().trim().min(2).max(255).optional(),
  service_subcategory_slug: Joi.string().trim().min(2).max(255).optional(),
  service_subcategory_image: Joi.string().allow(null, '').max(500).optional(),
  is_active: Joi.boolean().optional(),
  remark: Joi.string().trim().max(500).allow(null, '').optional(),
  deletedRemarks: Joi.string().trim().max(500).allow(null, '').optional(),
});
