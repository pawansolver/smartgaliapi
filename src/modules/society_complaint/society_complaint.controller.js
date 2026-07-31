import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyComplaintService from './society_complaint.service.js';

export const createComplaint = async (req, res, next) => {
  try {
    const complaint = await societyComplaintService.createComplaint(req.body);
    return successResponse(res, 201, 'Society complaint created successfully', complaint);
  } catch (error) {
    next(error);
  }
};

export const getAllComplaints = async (req, res, next) => {
  try {
    const complaints = await societyComplaintService.getAllComplaints();
    return successResponse(res, 200, 'Society complaints fetched successfully', complaints);
  } catch (error) {
    next(error);
  }
};

export const getComplaintById = async (req, res, next) => {
  try {
    const complaint = await societyComplaintService.getComplaintById(req.params.id);
    if (!complaint) {
      return errorResponse(res, 404, 'Society complaint not found');
    }
    return successResponse(res, 200, 'Society complaint fetched successfully', complaint);
  } catch (error) {
    next(error);
  }
};

export const updateComplaint = async (req, res, next) => {
  try {
    const complaint = await societyComplaintService.updateComplaint(req.params.id, req.body);
    if (!complaint) {
      return errorResponse(res, 404, 'Society complaint not found');
    }
    return successResponse(res, 200, 'Society complaint updated successfully', complaint);
  } catch (error) {
    next(error);
  }
};

export const deleteComplaint = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const complaint = await societyComplaintService.softDeleteComplaint(req.params.id, deletedRemarks, updated_by);
    if (!complaint) {
      return errorResponse(res, 404, 'Society complaint not found');
    }
    return successResponse(res, 200, 'Society complaint deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteComplaints = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await societyComplaintService.bulkSoftDeleteComplaints(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Society complaints deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
