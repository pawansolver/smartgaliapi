import Joi from 'joi';

export const createBookingSchema = Joi.object({
  listing_id: Joi.number().integer().positive().required(),
  scheduled_at: Joi.date().iso().required(),
  time_slot: Joi.string().trim().max(100).required(),
  service_address: Joi.string().trim().min(5).max(1000).required(),
  society_id: Joi.number().integer().positive().allow(null).optional(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
  locality: Joi.string().trim().max(100).allow(null, '').optional(),
  pincode: Joi.string().trim().pattern(/^\d{6}$/).allow(null, '').optional(),
  city: Joi.string().trim().max(100).allow(null, '').optional(),
  locality_id: Joi.number().integer().positive().allow(null).optional(),
  pincode_id: Joi.number().integer().positive().allow(null).optional(),
  city_id: Joi.number().integer().positive().allow(null).optional(),
  notes: Joi.string().trim().max(2000).allow(null, '').optional(),
  package_id: Joi.number().integer().positive().allow(null).optional(),
  addon_ids: Joi.array().items(Joi.number().integer().positive()).default([]),
  material_charge: Joi.number().min(0).max(999999.99).default(0),
  discount_amount: Joi.number().min(0).max(999999.99).default(0),
  duration_hours: Joi.number().min(1).max(24).default(1),
  amount: Joi.number().min(0).max(999999.99).allow(null).optional(),
  package_name: Joi.string().trim().max(200).allow(null, '').optional(),
  package_price: Joi.number().min(0).max(999999.99).allow(null).optional(),
  platform_fee: Joi.number().min(0).max(999999.99).allow(null).optional(),
  gst_amount: Joi.number().min(0).max(999999.99).allow(null).optional(),
  selected_addon_names: Joi.array().items(Joi.string().trim()).default([]),
});

export const cancelBookingSchema = Joi.object({
  cancellation_reason: Joi.string().trim().min(3).max(1000).required(),
});

export const rejectBookingSchema = Joi.object({
  rejection_reason: Joi.string().trim().min(3).max(1000).required(),
});

export const scheduleBookingSchema = Joi.object({
  scheduled_at: Joi.date().iso().required(),
  time_slot: Joi.string().trim().max(100).required(),
  notes: Joi.string().trim().max(1000).allow(null, '').optional(),
});

export const startBookingSchema = Joi.object({
  doorstep_pin: Joi.string().trim().pattern(/^\d{4}$/).required()
    .messages({ 'string.pattern.base': 'Doorstep PIN must be a 4-digit numeric code.' }),
});

export const transitionBookingSchema = Joi.object({
  action: Joi.string().valid('accept', 'reject', 'schedule', 'on_the_way', 'start', 'complete', 'cancel').required(),
  doorstep_pin: Joi.string().trim().pattern(/^\d{4}$/).optional(),
  reason: Joi.string().trim().max(1000).allow(null, '').optional(),
  scheduled_at: Joi.date().iso().optional(),
  time_slot: Joi.string().trim().max(100).optional(),
  notes: Joi.string().trim().max(1000).allow(null, '').optional(),
});
