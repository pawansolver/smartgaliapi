import Joi from 'joi';

export const createReviewSchema = Joi.object({
  booking_id: Joi.number().integer().positive().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().trim().min(2).max(2000).required(),
});
