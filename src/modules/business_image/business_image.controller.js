import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessImageService from './business_image.service.js';

export const createImage = async (req, res, next) => {
  try {
    const image = await businessImageService.createImage(req.body);
    return successResponse(res, 201, 'Business image added successfully', image);
  } catch (error) {
    next(error);
  }
};

export const getAllImages = async (req, res, next) => {
  try {
    const images = await businessImageService.getAllImages();
    return successResponse(res, 200, 'Business images fetched successfully', images);
  } catch (error) {
    next(error);
  }
};

export const getImageById = async (req, res, next) => {
  try {
    const image = await businessImageService.getImageById(req.params.id);
    if (!image) {
      return errorResponse(res, 404, 'Business image not found');
    }
    return successResponse(res, 200, 'Business image fetched successfully', image);
  } catch (error) {
    next(error);
  }
};

export const updateImage = async (req, res, next) => {
  try {
    const image = await businessImageService.updateImage(req.params.id, req.body);
    if (!image) {
      return errorResponse(res, 404, 'Business image not found');
    }
    return successResponse(res, 200, 'Business image updated successfully', image);
  } catch (error) {
    next(error);
  }
};

export const deleteImage = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const image = await businessImageService.softDeleteImage(req.params.id, deletedRemarks, updated_by);
    if (!image) {
      return errorResponse(res, 404, 'Business image not found');
    }
    return successResponse(res, 200, 'Business image deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};
