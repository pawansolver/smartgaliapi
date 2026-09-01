import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyVisitorService from './society_visitor.service.js';

export const createVisitor = async (req, res, next) => {
  try {
    const callerUserId = req.user?.id || req.user?.userId;
    const societyId = req.body.society_id;
    const visitor = await societyVisitorService.createVisitor(societyId, callerUserId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Visitor registered successfully', visitor);
  } catch (error) {
    return next(error);
  }
};

export const getAllVisitors = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const role = req.societyContext?.role;
    const isStaff = ['owner', 'admin', 'committee', 'security'].includes(role);

    const result = await societyVisitorService.getAllVisitors(societyId, req.query, userId, isStaff);
    return successResponse(res, 200, 'Society visitors retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

export const getVisitorById = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const role = req.societyContext?.role;
    const isStaff = ['owner', 'admin', 'committee', 'security'].includes(role);

    const visitor = await societyVisitorService.getVisitorById(req.params.id, societyId, userId, isStaff);
    if (!visitor) return errorResponse(res, 404, 'Society visitor not found');
    return successResponse(res, 200, 'Society visitor retrieved successfully', visitor);
  } catch (error) {
    return next(error);
  }
};

export const updateVisitor = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const visitor = await societyVisitorService.updateVisitor(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!visitor) return errorResponse(res, 404, 'Society visitor not found');
    return successResponse(res, 200, 'Society visitor updated successfully', visitor);
  } catch (error) {
    return next(error);
  }
};

export const updateVisitorStatus = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const visitor = await societyVisitorService.updateVisitorStatus(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!visitor) return errorResponse(res, 404, 'Society visitor not found');
    return successResponse(res, 200, 'Visitor status updated successfully', visitor);
  } catch (error) {
    return next(error);
  }
};

export const deleteVisitor = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const visitor = await societyVisitorService.softDeleteVisitor(req.params.id, societyId, req.body?.deletedRemarks, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!visitor) return errorResponse(res, 404, 'Society visitor not found');
    return successResponse(res, 200, 'Society visitor deleted successfully');
  } catch (error) {
    return next(error);
  }
};
