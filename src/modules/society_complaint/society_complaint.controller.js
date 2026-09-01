import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyComplaintService from './society_complaint.service.js';

export const createComplaint = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.body.society_id;
    const complaint = await societyComplaintService.createComplaint(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Society complaint submitted successfully', complaint);
  } catch (error) {
    return next(error);
  }
};

export const getAllComplaints = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const role = req.societyContext?.role;
    const isAdminOrCommittee = ['owner', 'admin', 'committee'].includes(role);

    const result = await societyComplaintService.getAllComplaints(societyId, req.query, userId, isAdminOrCommittee);
    return successResponse(res, 200, 'Society complaints retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

export const getComplaintById = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const role = req.societyContext?.role;
    const isAdminOrCommittee = ['owner', 'admin', 'committee'].includes(role);

    const complaint = await societyComplaintService.getComplaintById(req.params.id, societyId, userId, isAdminOrCommittee);
    if (!complaint) return errorResponse(res, 404, 'Society complaint not found');
    return successResponse(res, 200, 'Society complaint retrieved successfully', complaint);
  } catch (error) {
    return next(error);
  }
};

export const updateComplaint = async (req, res, next) => {
  return updateComplaintStatus(req, res, next);
};

export const updateComplaintStatus = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const complaint = await societyComplaintService.updateComplaintStatus(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!complaint) return errorResponse(res, 404, 'Society complaint not found');
    return successResponse(res, 200, 'Complaint status updated successfully', complaint);
  } catch (error) {
    return next(error);
  }
};

export const assignComplaint = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const complaint = await societyComplaintService.assignComplaint(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!complaint) return errorResponse(res, 404, 'Society complaint not found');
    return successResponse(res, 200, 'Complaint assigned successfully', complaint);
  } catch (error) {
    return next(error);
  }
};

export const deleteComplaint = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const complaint = await societyComplaintService.softDeleteComplaint(req.params.id, societyId, req.body?.deletedRemarks, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!complaint) return errorResponse(res, 404, 'Society complaint not found');
    return successResponse(res, 200, 'Society complaint deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const bulkDeleteComplaints = async (req, res, next) => {
  return deleteComplaint(req, res, next);
};
