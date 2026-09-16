import { successResponse, errorResponse } from '../../utils/response.js';
import * as service from './super_admin_complaint.service.js';

export const getGlobalSummary = async (req, res, next) => {
  try {
    const summary = await service.getGlobalSummary(req.query);
    return successResponse(res, 200, 'Global complaint summary retrieved successfully', summary);
  } catch (err) {
    return next(err);
  }
};

export const getGlobalComplaints = async (req, res, next) => {
  try {
    const result = await service.getGlobalComplaints(req.query);
    return successResponse(res, 200, 'Global complaints retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (err) {
    return next(err);
  }
};

export const getGlobalComplaintById = async (req, res, next) => {
  try {
    const complaint = await service.getGlobalComplaintById(req.params.id);
    if (!complaint) return errorResponse(res, 404, 'Complaint not found.');
    return successResponse(res, 200, 'Complaint details retrieved successfully', complaint);
  } catch (err) {
    return next(err);
  }
};

export const getSocietiesList = async (req, res, next) => {
  try {
    const societies = await service.getSocietiesList();
    return successResponse(res, 200, 'Societies retrieved successfully', societies);
  } catch (err) {
    return next(err);
  }
};

export const getComplaintAuditLogs = async (req, res, next) => {
  try {
    const result = await service.getComplaintAuditLogs(req.query);
    return successResponse(res, 200, 'Complaint audit logs retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (err) {
    return next(err);
  }
};
