import { successResponse, errorResponse } from '../../utils/response.js';
import * as postShareService from './post_share.service.js';

export const createShare = async (req, res, next) => {
  try {
    const share = await postShareService.createShare(req.body);
    return successResponse(res, 201, 'Post share created successfully', share);
  } catch (error) {
    next(error);
  }
};

export const getAllShares = async (req, res, next) => {
  try {
    const shares = await postShareService.getAllShares();
    return successResponse(res, 200, 'Post shares fetched successfully', shares);
  } catch (error) {
    next(error);
  }
};

export const getShareById = async (req, res, next) => {
  try {
    const share = await postShareService.getShareById(req.params.id);
    if (!share) {
      return errorResponse(res, 404, 'Post share not found');
    }
    return successResponse(res, 200, 'Post share fetched successfully', share);
  } catch (error) {
    next(error);
  }
};

export const updateShare = async (req, res, next) => {
  try {
    const share = await postShareService.updateShare(req.params.id, req.body);
    if (!share) {
      return errorResponse(res, 404, 'Post share not found');
    }
    return successResponse(res, 200, 'Post share updated successfully', share);
  } catch (error) {
    next(error);
  }
};

export const deleteShare = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const share = await postShareService.softDeleteShare(req.params.id, deletedRemarks, updated_by);
    if (!share) {
      return errorResponse(res, 404, 'Post share not found');
    }
    return successResponse(res, 200, 'Post share deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteShares = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await postShareService.bulkSoftDeleteShares(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Post shares deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
