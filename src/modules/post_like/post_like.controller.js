import { successResponse, errorResponse } from '../../utils/response.js';
import * as postLikeService from './post_like.service.js';

export const createLike = async (req, res, next) => {
  try {
    const like = await postLikeService.createLike(req.body);
    return successResponse(res, 201, 'Post like created successfully', like);
  } catch (error) {
    next(error);
  }
};

export const getAllLikes = async (req, res, next) => {
  try {
    const likes = await postLikeService.getAllLikes();
    return successResponse(res, 200, 'Post likes fetched successfully', likes);
  } catch (error) {
    next(error);
  }
};

export const getLikeById = async (req, res, next) => {
  try {
    const like = await postLikeService.getLikeById(req.params.id);
    if (!like) {
      return errorResponse(res, 404, 'Post like not found');
    }
    return successResponse(res, 200, 'Post like fetched successfully', like);
  } catch (error) {
    next(error);
  }
};

export const updateLike = async (req, res, next) => {
  try {
    const like = await postLikeService.updateLike(req.params.id, req.body);
    if (!like) {
      return errorResponse(res, 404, 'Post like not found');
    }
    return successResponse(res, 200, 'Post like updated successfully', like);
  } catch (error) {
    next(error);
  }
};

export const deleteLike = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const like = await postLikeService.softDeleteLike(req.params.id, deletedRemarks, updated_by);
    if (!like) {
      return errorResponse(res, 404, 'Post like not found');
    }
    return successResponse(res, 200, 'Post like deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteLikes = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await postLikeService.bulkSoftDeleteLikes(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Post likes deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
