import { successResponse, errorResponse } from '../../utils/response.js';
import { getImageUrl } from '../../utils/fileUpload.js';
import * as businessCategoryService from './business_category.service.js';

export const createCategory = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.icon = getImageUrl(req, req.file, 'category');
    }
    const category = await businessCategoryService.createCategory(data);
    return successResponse(res, 201, 'Business category created successfully', category);
  } catch (error) {
    next(error);
  }
};

export const getAllCategories = async (req, res, next) => {
  try {
    const categories = await businessCategoryService.getAllCategories();
    return successResponse(res, 200, 'Business categories fetched successfully', categories);
  } catch (error) {
    next(error);
  }
};

export const getCategoryById = async (req, res, next) => {
  try {
    const category = await businessCategoryService.getCategoryById(req.params.id);
    if (!category) {
      return errorResponse(res, 404, 'Business category not found');
    }
    return successResponse(res, 200, 'Business category fetched successfully', category);
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.icon = getImageUrl(req, req.file, 'category');
    }
    const category = await businessCategoryService.updateCategory(req.params.id, data);
    if (!category) {
      return errorResponse(res, 404, 'Business category not found');
    }
    return successResponse(res, 200, 'Business category updated successfully', category);
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const category = await businessCategoryService.softDeleteCategory(req.params.id, deletedRemarks, updated_by);
    if (!category) {
      return errorResponse(res, 404, 'Business category not found');
    }
    return successResponse(res, 200, 'Business category deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};
