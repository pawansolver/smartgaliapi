import Joi from 'joi';
import { EVENT_STATUS, EVENT_VISIBILITY, EVENT_TYPE } from './event.model.js';
import { RSVP_STATUS } from '../event_participant/event_participant.model.js';

export const createEventSchema = Joi.object({
  title: Joi.string().trim().min(3).max(255).required().messages({
    'string.empty': 'Event title is required',
    'string.min': 'Title must be at least 3 characters',
    'string.max': 'Title cannot exceed 255 characters',
  }),
  description: Joi.string().trim().max(5000).allow('', null).optional(),
  category_id: Joi.number().integer().positive().allow(null).optional(),
  community_id: Joi.number().integer().positive().allow(null).optional(),
  event_type: Joi.string().valid(...Object.values(EVENT_TYPE)).default(EVENT_TYPE.OFFLINE),
  visibility: Joi.string().valid(...Object.values(EVENT_VISIBILITY)).default(EVENT_VISIBILITY.PUBLIC),
  status: Joi.string().valid(EVENT_STATUS.DRAFT, EVENT_STATUS.PUBLISHED).default(EVENT_STATUS.PUBLISHED),
  start_at: Joi.date().iso().required().messages({
    'date.base': 'A valid start date/time is required',
    'any.required': 'Start date/time is required',
  }),
  end_at: Joi.date().iso().greater(Joi.ref('start_at')).allow(null).optional().messages({
    'date.greater': 'End date/time must be after start date/time',
  }),
  location: Joi.string().trim().max(500).allow('', null).optional(),
  location_name: Joi.string().trim().max(255).allow('', null).optional(),
  address: Joi.string().trim().max(1000).allow('', null).optional(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
  max_participants: Joi.number().integer().min(1).max(1000000).allow(null).optional(),
  cover_image: Joi.string().trim().allow('', null).optional(),
});

export const updateEventSchema = Joi.object({
  title: Joi.string().trim().min(3).max(255).optional(),
  description: Joi.string().trim().max(5000).allow('', null).optional(),
  category_id: Joi.number().integer().positive().allow(null).optional(),
  event_type: Joi.string().valid(...Object.values(EVENT_TYPE)).optional(),
  visibility: Joi.string().valid(...Object.values(EVENT_VISIBILITY)).optional(),
  status: Joi.string().valid(...Object.values(EVENT_STATUS)).optional(),
  start_at: Joi.date().iso().optional(),
  end_at: Joi.date().iso().allow(null).optional(),
  location: Joi.string().trim().max(500).allow('', null).optional(),
  location_name: Joi.string().trim().max(255).allow('', null).optional(),
  address: Joi.string().trim().max(1000).allow('', null).optional(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
  max_participants: Joi.number().integer().min(1).max(1000000).allow(null).optional(),
  cover_image: Joi.string().trim().allow('', null).optional(),
}).min(1);

export const rsvpSchema = Joi.object({
  status: Joi.string().valid(...Object.values(RSVP_STATUS)).required().messages({
    'any.only': 'Status must be one of: going, interested, declined, invited',
    'any.required': 'RSVP status is required',
  }),
});

export const nearbyQuerySchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required().messages({
    'any.required': 'Latitude (lat) is required for nearby search',
  }),
  lng: Joi.number().min(-180).max(180).required().messages({
    'any.required': 'Longitude (lng) is required for nearby search',
  }),
  radiusKm: Joi.number().min(0.1).max(500).default(50),
  category_id: Joi.number().integer().positive().optional(),
  event_type: Joi.string().valid(...Object.values(EVENT_TYPE)).optional(),
  cursor: Joi.string().allow('', null).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const upcomingQuerySchema = Joi.object({
  category_id: Joi.number().integer().positive().optional(),
  event_type: Joi.string().valid(...Object.values(EVENT_TYPE)).optional(),
  community_id: Joi.number().integer().positive().optional(),
  search: Joi.string().trim().max(100).allow('', null).optional(),
  cursor: Joi.string().allow('', null).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const eventIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'Event ID must be a positive integer',
  }),
});
