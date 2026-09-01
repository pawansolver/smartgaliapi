import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyMemberService from './society_member.service.js';

export const createMember = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.body.society_id;
    const member = await societyMemberService.createMember(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Society membership registered successfully', member);
  } catch (error) {
    return next(error);
  }
};

export const getAllMembers = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const result = await societyMemberService.getAllMembers(societyId, req.query);
    return successResponse(res, 200, 'Society members retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

export const getMemberById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const member = await societyMemberService.getMemberById(req.params.id, societyId);
    if (!member) return errorResponse(res, 404, 'Society member not found');
    return successResponse(res, 200, 'Society member retrieved successfully', member);
  } catch (error) {
    return next(error);
  }
};

export const updateMember = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const member = await societyMemberService.updateMember(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!member) return errorResponse(res, 404, 'Society member not found');
    return successResponse(res, 200, 'Society member updated successfully', member);
  } catch (error) {
    return next(error);
  }
};

export const updateMemberRole = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const member = await societyMemberService.updateMember(req.params.id, societyId, { role: req.body.role }, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!member) return errorResponse(res, 404, 'Society member not found');
    return successResponse(res, 200, 'Member role updated successfully', member);
  } catch (error) {
    return next(error);
  }
};

export const approveMember = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const member = await societyMemberService.approveMember(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!member) return errorResponse(res, 404, 'Society member not found');
    return successResponse(res, 200, 'Member status updated successfully', member);
  } catch (error) {
    return next(error);
  }
};

export const deleteMember = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const member = await societyMemberService.removeMember(req.params.id, societyId, req.body?.deletedRemarks, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!member) return errorResponse(res, 404, 'Society member not found');
    return successResponse(res, 200, 'Society member removed successfully');
  } catch (error) {
    return next(error);
  }
};

export const bulkDeleteMembers = async (req, res, next) => {
  return deleteMember(req, res, next);
};
