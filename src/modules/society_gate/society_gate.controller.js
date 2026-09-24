import * as gateService from './society_gate.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const createGate = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const gate = await gateService.createGate(societyId, actorUserId, req.body, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 201, 'Gate created successfully', gate);
  } catch (err) {
    next(err);
  }
};

export const getGates = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const list = await gateService.getGates(societyId, req.query);
    return successResponse(res, 200, 'Gates retrieved successfully', list);
  } catch (err) {
    next(err);
  }
};

export const getGateById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const gate = await gateService.getGateById(req.params.id, societyId);
    if (!gate) return errorResponse(res, 404, 'Gate not found');
    return successResponse(res, 200, 'Gate details retrieved', gate);
  } catch (err) {
    next(err);
  }
};

export const updateGate = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const updated = await gateService.updateGate(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!updated) return errorResponse(res, 404, 'Gate not found');
    return successResponse(res, 200, 'Gate updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

export const deleteGate = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const deleted = await gateService.deleteGate(req.params.id, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!deleted) return errorResponse(res, 404, 'Gate not found');
    return successResponse(res, 200, 'Gate deleted successfully');
  } catch (err) {
    next(err);
  }
};
