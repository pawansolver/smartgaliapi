import { successResponse, errorResponse } from '../../utils/response.js';
import * as serviceReviewService from './service_review.service.js';

export const createReview = async (req, res, next) => {
  try {
    const review = await serviceReviewService.createReview(req.body, req.user);
    return successResponse(res, 201, 'Service review submitted successfully', review);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

export const getAllReviews = async (req, res, next) => {
  try {
    const reviews = await serviceReviewService.getAllReviews(req.query);
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

export const deleteReview = async (req, res, next) => {
  try {
    const { deletedRemarks } = req.body;
    await serviceReviewService.softDeleteReview(req.params.id, deletedRemarks, req.user);
    return successResponse(res, 200, 'Service review deleted successfully', null);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};
