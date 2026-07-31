import { successResponse, errorResponse } from '../../utils/response.js';
import * as mediaFileService from './media_file.service.js';

export const createFile = async (req, res, next) => {
  try {
    const file = await mediaFileService.createFile(req.body);
    return successResponse(res, 201, 'Media file created successfully', file);
  } catch (error) {
    next(error);
  }
};

export const getAllFiles = async (req, res, next) => {
  try {
    const files = await mediaFileService.getAllFiles();
    return successResponse(res, 200, 'Media files fetched successfully', files);
  } catch (error) {
    next(error);
  }
};

export const getFileById = async (req, res, next) => {
  try {
    const file = await mediaFileService.getFileById(req.params.id);
    if (!file) {
      return errorResponse(res, 404, 'Media file not found');
    }
    return successResponse(res, 200, 'Media file fetched successfully', file);
  } catch (error) {
    next(error);
  }
};

export const updateFile = async (req, res, next) => {
  try {
    const file = await mediaFileService.updateFile(req.params.id, req.body);
    if (!file) {
      return errorResponse(res, 404, 'Media file not found');
    }
    return successResponse(res, 200, 'Media file updated successfully', file);
  } catch (error) {
    next(error);
  }
};

export const deleteFile = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const file = await mediaFileService.softDeleteFile(req.params.id, deletedRemarks, updated_by);
    if (!file) {
      return errorResponse(res, 404, 'Media file not found');
    }
    return successResponse(res, 200, 'Media file deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteFiles = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await mediaFileService.bulkSoftDeleteFiles(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Media files deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
