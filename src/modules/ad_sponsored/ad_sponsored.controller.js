import { successResponse, errorResponse } from '../../utils/response.js';
import * as adSponsoredService from './ad_sponsored.service.js';

export const createAdSponsoredPost = async (req, res, next) => {
  try {
    const sponsored = await adSponsoredService.createAdSponsoredPost(req.body);
    return successResponse(res, 201, 'Sponsored Post created successfully', sponsored);
  } catch (error) {
    next(error);
  }
};

export const getAllAdSponsoredPosts = async (req, res, next) => {
  try {
    const sponsored = await adSponsoredService.getAllAdSponsoredPosts();
    return successResponse(res, 200, 'Sponsored Posts fetched successfully', sponsored);
  } catch (error) {
    next(error);
  }
};

export const getAdSponsoredPostById = async (req, res, next) => {
  try {
    const sponsored = await adSponsoredService.getAdSponsoredPostById(req.params.id);
    if (!sponsored) return errorResponse(res, 404, 'Sponsored Post not found');
    return successResponse(res, 200, 'Sponsored Post fetched successfully', sponsored);
  } catch (error) {
    next(error);
  }
};

export const updateAdSponsoredPost = async (req, res, next) => {
  try {
    const sponsored = await adSponsoredService.updateAdSponsoredPost(req.params.id, req.body);
    if (!sponsored) return errorResponse(res, 404, 'Sponsored Post not found');
    return successResponse(res, 200, 'Sponsored Post updated successfully', sponsored);
  } catch (error) {
    next(error);
  }
};

export const deleteAdSponsoredPost = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const sponsored = await adSponsoredService.deleteAdSponsoredPost(req.params.id, deletedRemarks, updated_by);
    if (!sponsored) return errorResponse(res, 404, 'Sponsored Post not found');
    return successResponse(res, 200, 'Sponsored Post deleted successfully', null);
  } catch (error) {
    next(error);
  }
};
