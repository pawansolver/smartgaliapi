import { successResponse, errorResponse } from '../../utils/response.js';
import * as serviceCategoryService from './service_category.service.js';
import { getImageUrl } from '../../utils/fileUpload.js';

export const createCategory = async (req, res, next) => {
  try {
    const categoryData = { ...req.body };
    if (req.file) {
      categoryData.serviceCategoryImage = getImageUrl(req, req.file, 'service_category');
    }
    const category = await serviceCategoryService.createCategory(categoryData);
    return successResponse(res, 201, 'Service category created successfully', category);
  } catch (error) {
    next(error);
  }
};

export const getAllCategories = async (req, res, next) => {
  try {
    const categories = await serviceCategoryService.getAllCategories();
    return successResponse(res, 200, 'Service categories fetched successfully', categories);
  } catch (error) {
    next(error);
  }
};

export const getCategoryById = async (req, res, next) => {
  try {
    const category = await serviceCategoryService.getCategoryById(req.params.id);
    if (!category) {
      return errorResponse(res, 404, 'Service category not found');
    }
    return successResponse(res, 200, 'Service category fetched successfully', category);
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const categoryData = { ...req.body };
    if (req.file) {
      categoryData.serviceCategoryImage = getImageUrl(req, req.file, 'service_category');
    }
    const category = await serviceCategoryService.updateCategory(req.params.id, categoryData);
    if (!category) {
      return errorResponse(res, 404, 'Service category not found');
    }
    return successResponse(res, 200, 'Service category updated successfully', category);
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const category = await serviceCategoryService.softDeleteCategory(req.params.id, deletedRemarks, updated_by);
    if (!category) {
      return errorResponse(res, 404, 'Service category not found');
    }
    return successResponse(res, 200, 'Service category deleted successfully', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteCategories = async (req, res, next) => {
  try {
    const { serviceCategoryIds, deletedRemarks, updated_by } = req.body;
    if (!serviceCategoryIds || !Array.isArray(serviceCategoryIds) || serviceCategoryIds.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of serviceCategoryIds');
    }
    await serviceCategoryService.bulkSoftDeleteCategories(serviceCategoryIds, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Service categories deleted successfully', null);
  } catch (error) {
    next(error);
  }
};
