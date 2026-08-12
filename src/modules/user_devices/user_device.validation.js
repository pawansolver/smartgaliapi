import Joi from 'joi';
import { errorResponse } from '../../utils/response.js';

export const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return errorResponse(
      res,
      422,
      'Validation failed',
      error.details.map(({ message }) => message),
    );
  }
  req.body = value;
  next();
};

const deviceId = Joi.string().trim().min(3).max(128).required();
const platform = Joi.string().valid('android', 'ios', 'web').required();
const pushToken = Joi.string().trim().min(20).max(512).required();

export const registerDeviceSchema = Joi.object({
  deviceId,
  platform,
  pushToken,
  appVersion: Joi.string().trim().max(32).allow('', null),
  deviceModel: Joi.string().trim().max(120).allow('', null),
});

export const updateDeviceSchema = Joi.object({
  pushToken,
  platform: Joi.string().valid('android', 'ios', 'web'),
  appVersion: Joi.string().trim().max(32).allow('', null),
  deviceModel: Joi.string().trim().max(120).allow('', null),
}).min(1);

export const deactivateDeviceSchema = Joi.object({
  deviceId,
});
