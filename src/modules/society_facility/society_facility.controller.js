import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyFacilityService from './society_facility.service.js';

export const createFacility = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.body.society_id;
    const facility = await societyFacilityService.createFacility(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Society facility created successfully', facility);
  } catch (error) {
    return next(error);
  }
};

export const getAllFacilities = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const facilities = await societyFacilityService.getAllFacilities(societyId, req.query);
    return successResponse(res, 200, 'Society facilities retrieved successfully', facilities);
  } catch (error) {
    return next(error);
  }
};

export const getFacilityById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const facility = await societyFacilityService.getFacilityById(req.params.id, societyId);
    if (!facility) return errorResponse(res, 404, 'Society facility not found');
    return successResponse(res, 200, 'Society facility retrieved successfully', facility);
  } catch (error) {
    return next(error);
  }
};

export const updateFacility = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const facility = await societyFacilityService.updateFacility(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!facility) return errorResponse(res, 404, 'Society facility not found');
    return successResponse(res, 200, 'Society facility updated successfully', facility);
  } catch (error) {
    return next(error);
  }
};

export const deleteFacility = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const facility = await societyFacilityService.softDeleteFacility(req.params.id, societyId, req.body?.deletedRemarks, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!facility) return errorResponse(res, 404, 'Society facility not found');
    return successResponse(res, 200, 'Society facility deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const bulkDeleteFacilities = async (req, res, next) => {
  return deleteFacility(req, res, next);
};
