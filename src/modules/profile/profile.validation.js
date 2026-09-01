import Joi from 'joi';
import { errorResponse } from '../../utils/response.js';

// Reusable middleware factory
export const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map((d) => d.message);
    return errorResponse(res, 422, 'Validation failed', details);
  }
  next();
};

export const updateProfileSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(120),
  email: Joi.string().email(),
  bio: Joi.string().trim().max(500).allow('', null),
  avatarUrl: Joi.string().uri().allow('', null),
  locationName: Joi.string().trim().max(255).allow('', null),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
}).min(1);

export const addressSchema = Joi.object({
  label: Joi.string().trim().max(50),
  houseNo: Joi.string().trim().max(120).allow('', null),
  street: Joi.string().trim().max(200).allow('', null),
  landmark: Joi.string().trim().max(200).allow('', null),
  city: Joi.string().trim().max(120).allow('', null),
  fullAddress: Joi.string().trim().max(500).allow('', null),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  isDefault: Joi.boolean(),
}).min(1);

export const supportTicketSchema = Joi.object({
  category: Joi.string().trim().min(2).max(80).required(),
  description: Joi.string().trim().min(10).max(5000).required(),
});

export const dataExportRequestSchema = Joi.object({}).max(0);

export const notificationPreferencesSchema = Joi.object({
  pushNotifications: Joi.object({
    societyAnnouncements: Joi.boolean(),
    complaintUpdates: Joi.boolean(),
    visitorAlerts: Joi.boolean(),
    eventReminders: Joi.boolean(),
    communityChat: Joi.boolean(),
    promotionalOffers: Joi.boolean(),
  }),
  professionalAlerts: Joi.object({
    bookingRequests: Joi.boolean(),
    customerMessages: Joi.boolean(),
  }),
  emailNotifications: Joi.object({
    weeklyDigest: Joi.boolean(),
    invoicesReceipts: Joi.boolean(),
  }),
}).min(1);

export const privacySettingsSchema = Joi.object({
  profileVisibility: Joi.string().valid('public', 'members_only'),
  showActivityStatus: Joi.boolean(),
}).min(1);

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().allow('', null),
  newPassword: Joi.string()
    .min(8)
    .pattern(/[0-9]/, 'number')
    .pattern(/[^a-zA-Z0-9]/, 'special character')
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters.',
      'string.pattern.name': 'New password must include at least one {#name}.',
      'any.required': 'newPassword is required.',
    }),
});

export const deleteAccountSchema = Joi.object({
  password: Joi.string().allow('', null),
  reason: Joi.string().trim().max(255).allow('', null),
  confirm: Joi.boolean().valid(true).required().messages({
    'any.only': 'You must confirm the irreversible deletion.',
    'any.required': 'Confirmation is required.',
  }),
});
