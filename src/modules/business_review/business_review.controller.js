import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessReviewService from './business_review.service.js';

export const createReview = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    if (req.user?.id && !payload.user_id && !payload.userId) {
      payload.user_id = req.user.id;
    }
    const review = await businessReviewService.createReview(payload);
    return successResponse(res, 201, 'Business review added successfully', review);
  } catch (error) {
    if (error.message && (error.message.includes('required') || error.message.includes('between 1 and 5'))) {
      return errorResponse(res, 400, error.message);
    }
    next(error);
  }
};

export const getAllReviews = async (req, res, next) => {
  try {
    const reviews = await businessReviewService.getAllReviews(req.query);
    return successResponse(res, 200, 'Business reviews fetched successfully', reviews);
  } catch (error) {
    next(error);
  }
};

export const getReviewsByBusiness = async (req, res, next) => {
  try {
    const result = await businessReviewService.getReviewsByBusinessId(req.params.businessId);
    return res.status(200).json({
      success: true,
      message: 'Business reviews fetched successfully',
      data: result.items,
      summary: result.summary,
    });
  } catch (error) {
    if (error.message && error.message.includes('required')) {
      return errorResponse(res, 400, error.message);
    }
    next(error);
  }
};

export const getReviewById = async (req, res, next) => {
  try {
    const review = await businessReviewService.getReviewById(req.params.id);
    if (!review) {
      return errorResponse(res, 404, 'Business review not found');
    }
    return successResponse(res, 200, 'Business review fetched successfully', review);
  } catch (error) {
    next(error);
  }
};

export const updateReview = async (req, res, next) => {
  try {
    const review = await businessReviewService.updateReview(req.params.id, req.body);
    if (!review) {
      return errorResponse(res, 404, 'Business review not found');
    }
    return successResponse(res, 200, 'Business review updated successfully', review);
  } catch (error) {
    next(error);
  }
};

export const deleteReview = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const review = await businessReviewService.softDeleteReview(req.params.id, deletedRemarks, updated_by);
    if (!review) {
      return errorResponse(res, 404, 'Business review not found');
    }
    return successResponse(res, 200, 'Business review deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};
