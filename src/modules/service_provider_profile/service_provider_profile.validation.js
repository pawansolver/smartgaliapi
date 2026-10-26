export const updateNotificationPreferencesSchema = Joi.object({
  notifBookings: Joi.boolean().optional(),
  newBookingRequests: Joi.boolean().optional(),
  notif_bookings: Joi.boolean().optional(),
  notifStatusReminders: Joi.boolean().optional(),
  jobReminders: Joi.boolean().optional(),
  notif_status_reminders: Joi.boolean().optional(),
  notifReviews: Joi.boolean().optional(),
  customerReviews: Joi.boolean().optional(),
  notif_reviews: Joi.boolean().optional(),
  notifPayouts: Joi.boolean().optional(),
  settlementsPayouts: Joi.boolean().optional(),
  notif_payouts: Joi.boolean().optional(),
}).min(1);

﻿import Joi from 'joi';

export const updateOperationalPreferencesSchema = Joi.object({
  auto_accept_bookings: Joi.boolean().optional(),
  autoAcceptBookings: Joi.boolean().optional(),
  priority_emergency_dispatch: Joi.boolean().optional(),
  emergencyDispatch: Joi.boolean().optional(),
  vacation_mode: Joi.boolean().optional(),
  vacationMode: Joi.boolean().optional(),
  notification_preferences: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
  notificationPreferences: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
}).min(1);

export const updateProviderProfileSchema = Joi.object({
  auto_accept_bookings: Joi.boolean().optional(),
  autoAcceptBookings: Joi.boolean().optional(),
  priority_emergency_dispatch: Joi.boolean().optional(),
  emergencyDispatch: Joi.boolean().optional(),
  vacation_mode: Joi.boolean().optional(),
  vacationMode: Joi.boolean().optional(),
  notification_preferences: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
  notificationPreferences: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
  service_category_id: Joi.number().integer().positive().allow(null).optional(),
  business_name: Joi.string().trim().max(255).allow(null, '').optional(),
  businessName: Joi.string().trim().max(255).allow(null, '').optional(),
  provider_type: Joi.string().valid('Independent Professional', 'Agency / Team').optional(),
  description: Joi.string().trim().max(2000).allow(null, '').optional(),
  experience: Joi.alternatives().try(Joi.string().trim().max(100), Joi.number()).allow(null, '').optional(),
  hourly_rate: Joi.number().min(0).max(999999.99).allow(null).optional(),
  is_online: Joi.boolean().optional(),
  languages: Joi.array()
    .items(Joi.string().trim().min(1).max(50))
    .unique()
    .max(15)
    .optional(),
  fullName: Joi.string().trim().min(1).max(100).allow(null, '').optional(),
  service_area: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
  availability: Joi.alternatives().try(Joi.object(), Joi.string()).optional(),
  is_verified: Joi.forbidden().messages({ 'any.unknown': 'You are not allowed to modify verification status' }),
  verification_status: Joi.forbidden().messages({ 'any.unknown': 'You are not allowed to modify verification status' }),
  rating: Joi.forbidden(),
  review_count: Joi.forbidden(),
  completed_jobs_count: Joi.forbidden(),
}).unknown(false);

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

export const uploadProviderDocumentSchema = Joi.object({
  document_type: Joi.string().trim().max(50).optional(),
  documentType: Joi.string().trim().max(50).optional(),
  document_type_id: Joi.number().integer().positive().optional(),
  documentTypeId: Joi.number().integer().positive().optional(),
  title: Joi.string().trim().max(255).allow(null, '').optional(),
  document_number: Joi.string().trim().max(100).allow(null, '').optional(),
  documentNumber: Joi.string().trim().max(100).allow(null, '').optional(),
  expiry_date: Joi.date().iso().allow(null).optional(),
  expiryDate: Joi.date().iso().allow(null).optional(),
  issue_date: Joi.date().iso().allow(null).optional(),
  issueDate: Joi.date().iso().allow(null).optional(),
});

export const verifyProviderDocumentSchema = Joi.object({
  status: Joi.string().valid('verified', 'rejected', 'under_review').required(),
  rejection_reason: Joi.string().trim().max(1000).allow(null, '').optional(),
});
