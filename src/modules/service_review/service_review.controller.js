import { successResponse, errorResponse } from '../../utils/response.js';
import * as serviceReviewService from './service_review.service.js';

export const createReview = async (req, res, next) => {
  try {
    const review = await serviceReviewService.createReview(req.body);
    return successResponse(res, 201, 'Service review created successfully', review);
  } catch (error) {
    next(error);
  }
};

export const getAllReviews = async (req, res, next) => {
  try {
    const reviews = await serviceReviewService.getAllReviews();
    return successResponse(res, 200, 'Service reviews fetched successfully', reviews);
  } catch (error) {
    next(error);
  }
};

export const getReviewById = async (req, res, next) => {
  try {
    const review = await serviceReviewService.getReviewById(req.params.id);
    if (!review) {
      return errorResponse(res, 404, 'Service review not found');
    }
    return successResponse(res, 200, 'Service review fetched successfully', review);
  } catch (error) {
    next(error);
  }
};

export const updateReview = async (req, res, next) => {
  try {
    const review = await serviceReviewService.updateReview(req.params.id, req.body);
    if (!review) {
      return errorResponse(res, 404, 'Service review not found');
    }
    return successResponse(res, 200, 'Service review updated successfully', review);
  } catch (error) {
    next(error);
  }
};

export const deleteReview = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const review = await serviceReviewService.softDeleteReview(req.params.id, deletedRemarks, updated_by);
    if (!review) {
      return errorResponse(res, 404, 'Service review not found');
    }
    return successResponse(res, 200, 'Service review deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteReviews = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await serviceReviewService.bulkSoftDeleteReviews(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Service reviews deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
