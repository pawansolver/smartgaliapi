import { successResponse, errorResponse } from '../../utils/response.js';
import * as reportService from './report.service.js';

export const createReport = async (req, res, next) => {
  try {
    const reportData = {
      ...req.body,
      reporter_id: req.body.reporter_id || req.user?.id,
      created_by: req.body.created_by || req.user?.id,
    };
    const report = await reportService.createReport(reportData);
    return successResponse(res, 201, 'Report created successfully', report);
  } catch (error) {
    next(error);
  }
};

export const getAllReports = async (req, res, next) => {
  try {
    const reports = await reportService.getAllReports();
    return successResponse(res, 200, 'Reports fetched successfully', reports);
  } catch (error) {
    next(error);
  }
};

export const getReportById = async (req, res, next) => {
  try {
    const report = await reportService.getReportById(req.params.id);
    if (!report) {
      return errorResponse(res, 404, 'Report not found');
    }
    return successResponse(res, 200, 'Report fetched successfully', report);
  } catch (error) {
    next(error);
  }
};

export const updateReport = async (req, res, next) => {
  try {
    const updateData = {
      ...req.body,
      updated_by: req.body.updated_by || req.user?.id,
    };
    const report = await reportService.updateReport(req.params.id, updateData);
    if (!report) {
      return errorResponse(res, 404, 'Report not found');
    }
    return successResponse(res, 200, 'Report updated successfully', report);
  } catch (error) {
    next(error);
  }
};

export const deleteReport = async (req, res, next) => {
  try {
    const deletedRemarks = req.body.deletedRemarks || 'Deleted by admin';
    const updated_by = req.body.updated_by || req.user?.id;
    const report = await reportService.softDeleteReport(req.params.id, deletedRemarks, updated_by);
    if (!report) {
      return errorResponse(res, 404, 'Report not found');
    }
    return successResponse(res, 200, 'Report deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteReports = async (req, res, next) => {
  try {
    const { ids, deletedRemarks } = req.body;
    const updated_by = req.body.updated_by || req.user?.id;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await reportService.bulkSoftDeleteReports(ids, deletedRemarks || 'Bulk deleted by admin', updated_by);
    return successResponse(res, 200, 'Reports deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
