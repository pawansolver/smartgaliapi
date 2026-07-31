import { successResponse, errorResponse } from '../../utils/response.js';
import * as postService from './post.service.js';

export const createPost = async (req, res, next) => {
  try {
    const post = await postService.createPost(req.body);
    return successResponse(res, 201, 'Post created successfully', post);
  } catch (error) {
    next(error);
  }
};

export const getAllPosts = async (req, res, next) => {
  try {
    const posts = await postService.getAllPosts();
    return successResponse(res, 200, 'Posts fetched successfully', posts);
  } catch (error) {
    next(error);
  }
};

export const getPostById = async (req, res, next) => {
  try {
    const post = await postService.getPostById(req.params.id);
    if (!post) {
      return errorResponse(res, 404, 'Post not found');
    }
    return successResponse(res, 200, 'Post fetched successfully', post);
  } catch (error) {
    next(error);
  }
};

export const updatePost = async (req, res, next) => {
  try {
    const post = await postService.updatePost(req.params.id, req.body);
    if (!post) {
      return errorResponse(res, 404, 'Post not found');
    }
    return successResponse(res, 200, 'Post updated successfully', post);
  } catch (error) {
    next(error);
  }
};

export const deletePost = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const post = await postService.softDeletePost(req.params.id, deletedRemarks, updated_by);
    if (!post) {
      return errorResponse(res, 404, 'Post not found');
    }
    return successResponse(res, 200, 'Post deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeletePosts = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await postService.bulkSoftDeletePosts(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Posts deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
