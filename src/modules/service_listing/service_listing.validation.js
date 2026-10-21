import Joi from 'joi';

const packageItemSchema = Joi.object({
  package_level_id: Joi.number().integer().positive().allow(null).optional(),
  name: Joi.string().trim().max(150).required(),
  description: Joi.string().trim().max(1000).allow(null, '').optional(),
  price: Joi.number().min(0).max(9999999.99).required(),
  duration_minutes: Joi.number().integer().min(0).allow(null).optional(),
  included_items: Joi.array().items(Joi.string().trim().max(255)).default([]),
});

const addonItemSchema = Joi.object({
  addon_type_id: Joi.number().integer().positive().allow(null).optional(),
  name: Joi.string().trim().max(150).required(),
  description: Joi.string().trim().max(1000).allow(null, '').optional(),
  price: Joi.number().min(0).max(9999999.99).required(),
  is_enabled: Joi.boolean().default(true),
});

const coverageAreaItemSchema = Joi.object({
  id: Joi.number().integer().positive().allow(null).optional(),
  coverage_scope: Joi.string().valid('PUBLIC', 'SOCIETY', 'SOCIETY_AND_PUBLIC').default('PUBLIC'),
  coverage_method: Joi.string().valid('RADIUS', 'LOCALITY', 'PINCODE', 'CITY', 'SOCIETY').default('RADIUS'),
  city_id: Joi.number().integer().positive().allow(null).optional(),
  locality_id: Joi.number().integer().positive().allow(null).optional(),
  pincode_id: Joi.number().integer().positive().allow(null).optional(),
  society_id: Joi.number().integer().positive().allow(null).optional(),
  origin_latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  origin_longitude: Joi.number().min(-180).max(180).allow(null).optional(),
  origin_address: Joi.string().trim().max(255).allow(null, '').optional(),
  radius_option_id: Joi.number().integer().positive().allow(null).optional(),
  is_active: Joi.boolean().default(true),
  display_order: Joi.number().integer().min(0).default(0),
});

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
  provider_id: Joi.number().integer().positive().optional(),

  // Coverage Scope & Multi-Coverage Areas
  coverage_scope: Joi.string().valid('PUBLIC', 'SOCIETY', 'SOCIETY_AND_PUBLIC').default('PUBLIC'),
  coverage_areas: Joi.array().items(coverageAreaItemSchema).default([]),

  // Enterprise Service Master References
  pricing_model_id: Joi.number().integer().positive().allow(null).optional(),
  pricing_unit_id: Joi.number().integer().positive().allow(null).optional(),
  duration_option_id: Joi.number().integer().positive().allow(null).optional(),
  min_duration_id: Joi.number().integer().positive().allow(null).optional(),
  buffer_option_id: Joi.number().integer().positive().allow(null).optional(),
  inspection_fee_type_id: Joi.number().integer().positive().allow(null).optional(),
  inspection_adjustment_id: Joi.number().integer().positive().allow(null).optional(),
  inspection_fee: Joi.number().min(0).max(9999999.99).allow(null).optional(),
  hourly_rate: Joi.number().min(0).max(9999999.99).allow(null).optional(),
  material_policy_id: Joi.number().integer().positive().allow(null).optional(),
  charge_type_id: Joi.number().integer().positive().allow(null).optional(),
  warranty_option_id: Joi.number().integer().positive().allow(null).optional(),
  execution_method_id: Joi.number().integer().positive().allow(null).optional(),
  service_area_type_id: Joi.number().integer().positive().allow(null).optional(),
  radius_option_id: Joi.number().integer().positive().allow(null).optional(),
  slot_duration_id: Joi.number().integer().positive().allow(null).optional(),
  booking_capacity_id: Joi.number().integer().positive().allow(null).optional(),

  // Child Packages & Addons
  packages: Joi.array().items(packageItemSchema).default([]),
  addons: Joi.array().items(addonItemSchema).default([]),
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

  // Coverage Scope & Multi-Coverage Areas
  coverage_scope: Joi.string().valid('PUBLIC', 'SOCIETY', 'SOCIETY_AND_PUBLIC').optional(),
  coverage_areas: Joi.array().items(coverageAreaItemSchema).optional(),

  // Enterprise Service Master References
  pricing_model_id: Joi.number().integer().positive().allow(null).optional(),
  pricing_unit_id: Joi.number().integer().positive().allow(null).optional(),
  duration_option_id: Joi.number().integer().positive().allow(null).optional(),
  min_duration_id: Joi.number().integer().positive().allow(null).optional(),
  buffer_option_id: Joi.number().integer().positive().allow(null).optional(),
  inspection_fee_type_id: Joi.number().integer().positive().allow(null).optional(),
  inspection_adjustment_id: Joi.number().integer().positive().allow(null).optional(),
  inspection_fee: Joi.number().min(0).max(9999999.99).allow(null).optional(),
  hourly_rate: Joi.number().min(0).max(9999999.99).allow(null).optional(),
  material_policy_id: Joi.number().integer().positive().allow(null).optional(),
  charge_type_id: Joi.number().integer().positive().allow(null).optional(),
  warranty_option_id: Joi.number().integer().positive().allow(null).optional(),
  execution_method_id: Joi.number().integer().positive().allow(null).optional(),
  service_area_type_id: Joi.number().integer().positive().allow(null).optional(),
  radius_option_id: Joi.number().integer().positive().allow(null).optional(),
  slot_duration_id: Joi.number().integer().positive().allow(null).optional(),
  booking_capacity_id: Joi.number().integer().positive().allow(null).optional(),

  // Child Packages & Addons
  packages: Joi.array().items(packageItemSchema).optional(),
  addons: Joi.array().items(addonItemSchema).optional(),
});

export const moderateListingSchema = Joi.object({
  moderation_status: Joi.string().valid('approved', 'rejected', 'suspended', 'pending', 'under_review', 'paused', 'active').required(),
  moderation_remarks: Joi.string().trim().max(1000).allow(null, '').optional(),
  is_available: Joi.boolean().optional(),
});

export const queryListingsSchema = Joi.object({
  category_id: Joi.number().integer().positive().optional(),
  service_subcategory_id: Joi.number().integer().positive().optional(),
  pricing_model_id: Joi.number().integer().positive().optional(),
  execution_method_id: Joi.number().integer().positive().optional(),
  search: Joi.string().trim().max(100).allow(null, '').optional(),
  city: Joi.string().trim().max(100).allow(null, '').optional(),
  locality: Joi.string().trim().max(100).allow(null, '').optional(),
  pincode: Joi.string().trim().pattern(/^\d{6}$/).allow(null, '').optional(),
  city_id: Joi.number().integer().positive().optional(),
  locality_id: Joi.number().integer().positive().optional(),
  pincode_id: Joi.number().integer().positive().optional(),
  min_price: Joi.number().min(0).optional(),
  max_price: Joi.number().min(0).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});
