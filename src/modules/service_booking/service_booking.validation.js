import Joi from 'joi';

export const createBookingSchema = Joi.object({
  listing_id: Joi.number().integer().positive().required(),
  scheduled_at: Joi.date().iso().required(),
  time_slot: Joi.string().trim().max(100).required(),
  service_address: Joi.string().trim().min(5).max(1000).required(),
  notes: Joi.string().trim().max(2000).allow(null, '').optional(),
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
