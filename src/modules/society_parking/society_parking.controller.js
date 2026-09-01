import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyParkingService from './society_parking.service.js';

export const createParking = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.body.society_id;
    const parking = await societyParkingService.createParking(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Society parking allocated successfully', parking);
  } catch (error) {
    return next(error);
  }
};

export const getAllParkings = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const result = await societyParkingService.getAllParkings(societyId, req.query);
    return successResponse(res, 200, 'Society parking records retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

export const getParkingById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const parking = await societyParkingService.getParkingById(req.params.id, societyId);
    if (!parking) return errorResponse(res, 404, 'Society parking record not found');
    return successResponse(res, 200, 'Society parking retrieved successfully', parking);
  } catch (error) {
    return next(error);
  }
};

export const updateParking = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const parking = await societyParkingService.updateParking(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!parking) return errorResponse(res, 404, 'Society parking record not found');
    return successResponse(res, 200, 'Society parking updated successfully', parking);
  } catch (error) {
    return next(error);
  }
};

export const deleteParking = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const parking = await societyParkingService.softDeleteParking(req.params.id, societyId, req.body?.deletedRemarks, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!parking) return errorResponse(res, 404, 'Society parking record not found');
    return successResponse(res, 200, 'Society parking deleted successfully');
  } catch (error) {
    return next(error);
  }
};
