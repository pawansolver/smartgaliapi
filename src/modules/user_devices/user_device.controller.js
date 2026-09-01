import { successResponse, errorResponse } from '../../utils/response.js';
import * as deviceService from './user_device.service.js';

const authUserId = (req) => req.user?.id ?? req.user?.userId ?? req.user?.sub;

export const register = async (req, res, next) => {
  try {
    const userId = authUserId(req);
    if (!userId) return errorResponse(res, 401, 'Authentication required.');

    // Never trust body.userId
    const { deviceId, platform, pushToken, appVersion, deviceModel } = req.body;
    const result = await deviceService.registerDevice({
      userId,
      deviceId,
      platform,
      pushToken,
      appVersion: appVersion || null,
      deviceModel: deviceModel || null,
    });

    return successResponse(
      res,
      result.created ? 201 : 200,
      result.created ? 'Device registered.' : 'Device updated.',
      result.device,
    );
  } catch (error) {
    return next(error);
  }
};

export const update = async (req, res, next) => {
  try {
    const userId = authUserId(req);
    if (!userId) return errorResponse(res, 401, 'Authentication required.');

    const deviceId = req.params.deviceId;
    const result = await deviceService.updateDeviceToken({
      userId,
      deviceId,
      pushToken: req.body.pushToken,
      platform: req.body.platform,
      appVersion: req.body.appVersion ?? null,
      deviceModel: req.body.deviceModel ?? null,
    });

    if (result.error) return errorResponse(res, result.status || 404, result.error);
    return successResponse(res, 200, 'Device token updated.', result.device);
  } catch (error) {
    return next(error);
  }
};

export const list = async (req, res, next) => {
  try {
    const userId = authUserId(req);
    if (!userId) return errorResponse(res, 401, 'Authentication required.');
    const devices = await deviceService.getUserDevices(userId);
    return successResponse(res, 200, 'Devices fetched.', { devices });
  } catch (error) {
    return next(error);
  }
};

export const deactivate = async (req, res, next) => {
  try {
    const userId = authUserId(req);
    if (!userId) return errorResponse(res, 401, 'Authentication required.');

    const deviceId = req.body.deviceId || req.params.deviceId;
    const result = await deviceService.deactivateDevice({
      userId,
      deviceId,
      reason: 'user_logout',
    });
    if (result.error) return errorResponse(res, result.status || 404, result.error);
    return successResponse(res, 200, 'Device deactivated.', result.device);
  } catch (error) {
    return next(error);
  }
};

export const remove = async (req, res, next) => {
  try {
    const userId = authUserId(req);
    if (!userId) return errorResponse(res, 401, 'Authentication required.');

    const result = await deviceService.removeDevice({
      userId,
      deviceId: req.params.deviceId,
    });
    if (result.error) return errorResponse(res, result.status || 404, result.error);
    return successResponse(res, 200, 'Device removed.', null);
  } catch (error) {
    return next(error);
  }
};
