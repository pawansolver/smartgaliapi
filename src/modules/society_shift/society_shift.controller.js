import * as shiftService from './society_shift.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const createShift = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const shift = await shiftService.createShift(societyId, actorUserId, req.body, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 201, 'Shift created successfully', shift);
  } catch (err) {
    next(err);
  }
};

export const getShifts = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const list = await shiftService.getShifts(societyId, req.query);
    return successResponse(res, 200, 'Shifts retrieved successfully', list);
  } catch (err) {
    next(err);
  }
};

export const getShiftById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const shift = await shiftService.getShiftById(req.params.id, societyId);
    if (!shift) return errorResponse(res, 404, 'Shift not found');
    return successResponse(res, 200, 'Shift details retrieved', shift);
  } catch (err) {
    next(err);
  }
};

export const updateShift = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const updated = await shiftService.updateShift(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!updated) return errorResponse(res, 404, 'Shift not found');
    return successResponse(res, 200, 'Shift updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

export const deleteShift = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const deleted = await shiftService.deleteShift(req.params.id, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!deleted) return errorResponse(res, 404, 'Shift not found');
    return successResponse(res, 200, 'Shift deleted successfully');
  } catch (err) {
    next(err);
  }
};
