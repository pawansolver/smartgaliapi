import Joi from 'joi';

export const createReviewSchema = Joi.object({
  booking_id: Joi.number().integer().positive().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().trim().min(2).max(5000).required(),
  service_id: Joi.number().integer().positive().optional(),
  photos: Joi.array().items(Joi.string()).optional(),
  images: Joi.array().items(Joi.string()).optional(),
  aspects: Joi.object().optional(),
  badges: Joi.array().items(Joi.string()).optional(),
}).unknown(true);
