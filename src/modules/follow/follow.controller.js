import { successResponse, errorResponse } from '../../utils/response.js';
import * as followService from './follow.service.js';

export const createFollow = async (req, res, next) => {
  try {
    const follow = await followService.createFollow(req.body);
    return successResponse(res, 201, 'Follow created successfully', follow);
  } catch (error) {
    next(error);
  }
};

export const getAllFollows = async (req, res, next) => {
  try {
    const follows = await followService.getAllFollows();
    return successResponse(res, 200, 'Follows fetched successfully', follows);
  } catch (error) {
    next(error);
  }
};

export const getFollowById = async (req, res, next) => {
  try {
    const follow = await followService.getFollowById(req.params.id);
    if (!follow) {
      return errorResponse(res, 404, 'Follow not found');
    }
    return successResponse(res, 200, 'Follow fetched successfully', follow);
  } catch (error) {
    next(error);
  }
};

export const updateFollow = async (req, res, next) => {
  try {
    const follow = await followService.updateFollow(req.params.id, req.body);
    if (!follow) {
      return errorResponse(res, 404, 'Follow not found');
    }
    return successResponse(res, 200, 'Follow updated successfully', follow);
  } catch (error) {
    next(error);
  }
};

export const deleteFollow = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const follow = await followService.softDeleteFollow(req.params.id, deletedRemarks, updated_by);
    if (!follow) {
      return errorResponse(res, 404, 'Follow not found');
    }
    return successResponse(res, 200, 'Follow deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteFollows = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await followService.bulkSoftDeleteFollows(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Follows deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
