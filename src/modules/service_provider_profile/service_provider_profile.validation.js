import Joi from 'joi';

export const updateProviderProfileSchema = Joi.object({
  service_category_id: Joi.number().integer().positive().allow(null).optional(),
  business_name: Joi.string().trim().max(255).allow(null, '').optional(),
  provider_type: Joi.string().valid('Independent Professional', 'Agency / Team').optional(),
  description: Joi.string().trim().max(2000).allow(null, '').optional(),
  experience: Joi.string().trim().max(100).allow(null, '').optional(),
  hourly_rate: Joi.number().min(0).max(999999.99).allow(null).optional(),
  is_online: Joi.boolean().optional(),
});

export const updateServiceAreaSchema = Joi.object({
  city: Joi.string().trim().min(2).max(100).required(),
  localities: Joi.array().items(Joi.string().trim().min(1).max(100)).default([]),
  pincodes: Joi.array().items(Joi.string().trim().pattern(/^\d{6}$/)).default([]),
  radiusKm: Joi.number().min(0.5).max(100).default(10),
  centerLatitude: Joi.number().min(-90).max(90).optional(),
  centerLongitude: Joi.number().min(-180).max(180).optional(),
});

export const updateAvailabilitySchema = Joi.object({
  weeklySchedule: Joi.array().items(Joi.object({
    dayName: Joi.string().valid('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday').required(),
    weekday: Joi.number().integer().min(1).max(7).required(),
    isWorking: Joi.boolean().required(),
    startTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
    endTime: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/).required(),
  })).min(1).required(),
  slotDurationMinutes: Joi.number().integer().min(15).max(480).default(90),
  bufferDurationMinutes: Joi.number().integer().min(0).max(120).default(30),
  maxConcurrentBookings: Joi.number().integer().min(1).max(10).default(1),
  exceptions: Joi.array().items(Joi.object({
    id: Joi.string().optional(),
    date: Joi.date().iso().required(),
    reason: Joi.string().trim().max(255).allow(null, '').optional(),
    isFullDay: Joi.boolean().default(true),
  })).default([]),
});

export const verifyProviderSchema = Joi.object({
  is_verified: Joi.boolean().required(),
  verification_status: Joi.string().valid('notSubmitted', 'underReview', 'verified', 'rejected', 'actionRequired').required(),
  remarks: Joi.string().trim().max(1000).allow(null, '').optional(),
});
