import { successResponse, errorResponse } from '../../utils/response.js';
import * as savedPostService from './saved_post.service.js';

export const createSavedPost = async (req, res, next) => {
  try {
    const savedPostData = {
      ...req.body,
      user_id: req.user.id,
      created_by: req.user.id,
    };
    const savedPost = await savedPostService.createSavedPost(savedPostData);
    return successResponse(res, 201, 'Saved post created successfully', savedPost);
  } catch (error) {
    next(error);
  }
};

export const getAllSavedPosts = async (req, res, next) => {
  try {
    const savedPosts = await savedPostService.getAllSavedPosts();
    return successResponse(res, 200, 'Saved posts fetched successfully', savedPosts);
  } catch (error) {
    next(error);
  }
};

export const getSavedPostById = async (req, res, next) => {
  try {
    const savedPost = await savedPostService.getSavedPostById(req.params.id);
    if (!savedPost) {
      return errorResponse(res, 404, 'Saved post not found');
    }
    return successResponse(res, 200, 'Saved post fetched successfully', savedPost);
  } catch (error) {
    next(error);
  }
};

export const updateSavedPost = async (req, res, next) => {
  try {
    const savedPost = await savedPostService.updateSavedPost(req.params.id, req.body);
    if (!savedPost) {
      return errorResponse(res, 404, 'Saved post not found');
    }
    return successResponse(res, 200, 'Saved post updated successfully', savedPost);
  } catch (error) {
    next(error);
  }
};

export const deleteSavedPost = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const savedPost = await savedPostService.softDeleteSavedPost(req.params.id, deletedRemarks, updated_by);
    if (!savedPost) {
      return errorResponse(res, 404, 'Saved post not found');
    }
    return successResponse(res, 200, 'Saved post deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteSavedPosts = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await savedPostService.bulkSoftDeleteSavedPosts(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Saved posts deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
