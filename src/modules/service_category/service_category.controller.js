import { successResponse, errorResponse } from '../../utils/response.js';
import * as serviceCategoryService from './service_category.service.js';

export const createCategory = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const category = await serviceCategoryService.createCategory(req.body, req.file, adminUserId);
    return successResponse(res, 201, 'Service category created successfully', category);
  } catch (error) {
    next(error);
  }
};

export const getAllCategories = async (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';
    const categories = await serviceCategoryService.getAllCategories({ includeInactive });
    return successResponse(res, 200, 'Service categories fetched successfully', categories);
  } catch (error) {
    next(error);
  }
};

export const getCategoryById = async (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';
    const category = await serviceCategoryService.getCategoryById(req.params.id, { includeInactive });
    if (!category) {
      return errorResponse(res, 404, 'Service category not found');
    }
    return successResponse(res, 200, 'Service category fetched successfully', category);
  } catch (error) {
    next(error);
  }
};

export const getSubcategoriesByCategory = async (req, res, next) => {
  try {
    const categoryId = parseInt(req.params.categoryId, 10);
    if (!categoryId || isNaN(categoryId)) {
      return errorResponse(res, 400, 'Invalid category ID');
    }
    const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';
    const subcategories = await serviceCategoryService.getSubcategoriesByCategory(categoryId, { includeInactive });
    if (subcategories === null) {
      return errorResponse(res, 404, 'Service category not found or inactive');
    }
    return successResponse(res, 200, 'Subcategories fetched successfully', subcategories);
  } catch (error) {
    next(error);
  }
};

export const createSubcategory = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const categoryId = parseInt(req.params.categoryId, 10);
    if (!categoryId || isNaN(categoryId)) {
      return errorResponse(res, 400, 'Invalid category ID');
    }
    const subcategory = await serviceCategoryService.createSubcategory(categoryId, req.body, adminUserId);
    return successResponse(res, 201, 'Subcategory created successfully', subcategory);
  } catch (error) {
    next(error);
  }
};

export const updateSubcategory = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const categoryId = parseInt(req.params.categoryId, 10);
    const subcategoryId = parseInt(req.params.subcategoryId, 10);
    if (!categoryId || isNaN(categoryId) || !subcategoryId || isNaN(subcategoryId)) {
      return errorResponse(res, 400, 'Invalid category ID or subcategory ID');
    }
    const subcategory = await serviceCategoryService.updateSubcategory(categoryId, subcategoryId, req.body, adminUserId);
    return successResponse(res, 200, 'Subcategory updated successfully', subcategory);
  } catch (error) {
    next(error);
  }
};

export const deleteSubcategory = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const categoryId = parseInt(req.params.categoryId, 10);
    const subcategoryId = parseInt(req.params.subcategoryId, 10);
    if (!categoryId || isNaN(categoryId) || !subcategoryId || isNaN(subcategoryId)) {
      return errorResponse(res, 400, 'Invalid category ID or subcategory ID');
    }
    const subcategory = await serviceCategoryService.deleteSubcategory(categoryId, subcategoryId, req.body?.deletedRemarks, adminUserId);
    if (!subcategory) {
      return errorResponse(res, 404, 'Service subcategory not found');
    }
    return successResponse(res, 200, 'Subcategory deleted successfully');
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const category = await serviceCategoryService.updateCategory(req.params.id, req.body, req.file, adminUserId);
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
    const adminUserId = req.user?.id || req.user?.userId;
    const category = await serviceCategoryService.deleteCategory(req.params.id, req.body?.deletedRemarks, adminUserId);
    if (!category) {
      return errorResponse(res, 404, 'Service category not found');
    }
    return successResponse(res, 200, 'Service category deleted successfully');
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteCategories = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const { ids, deletedRemarks } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'IDs array is required for bulk delete');
    }
    await serviceCategoryService.bulkDeleteCategories(ids, deletedRemarks, adminUserId);
    return successResponse(res, 200, 'Service categories bulk deleted successfully');
  } catch (error) {
    next(error);
  }
};
