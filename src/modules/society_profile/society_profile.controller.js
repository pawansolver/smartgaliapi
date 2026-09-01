import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyProfileService from './society_profile.service.js';

export const createProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const profile = await societyProfileService.createProfile(userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Society profile created successfully', profile);
  } catch (error) {
    return next(error);
  }
};

export const getAllProfiles = async (req, res, next) => {
  try {
    const result = await societyProfileService.getAllProfiles(req.query);
    return successResponse(res, 200, 'Society profiles retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

export const getProfileById = async (req, res, next) => {
  try {
    const profile = await societyProfileService.getProfileById(req.params.id);
    if (!profile) return errorResponse(res, 404, 'Society profile not found');
    return successResponse(res, 200, 'Society profile retrieved successfully', profile);
  } catch (error) {
    return next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const profile = await societyProfileService.updateProfile(req.params.id, req.body, userId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!profile) return errorResponse(res, 404, 'Society profile not found');
    return successResponse(res, 200, 'Society profile updated successfully', profile);
  } catch (error) {
    return next(error);
  }
};

export const deleteProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const profile = await societyProfileService.softDeleteProfile(req.params.id, req.body?.deletedRemarks, userId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!profile) return errorResponse(res, 404, 'Society profile not found');
    return successResponse(res, 200, 'Society profile deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const transferOwnership = async (req, res, next) => {
  try {
    const currentOwnerId = req.user?.id || req.user?.userId;
    const society = await societyProfileService.transferSocietyOwnership(req.params.id, {
      currentOwnerId,
      targetUserId: req.body.target_user_id,
    }, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Society ownership transferred successfully', society);
  } catch (error) {
    return next(error);
  }
};
