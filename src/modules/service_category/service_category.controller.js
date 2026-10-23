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


import * as kycReqService from './kyc_requirement.service.js';

// ── KYC Document Types Master ───────────────────────────────────────────────

export const listDocumentTypes = async (req, res, next) => {
  try {
    const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';
    const types = await kycReqService.listDocumentTypes({ includeInactive });
    return successResponse(res, 200, 'KYC document types fetched successfully', types);
  } catch (error) {
    next(error);
  }
};

export const createDocumentType = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const docType = await kycReqService.createDocumentType(req.body, adminUserId);
    return successResponse(res, 201, 'KYC document type created successfully', docType);
  } catch (error) {
    next(error);
  }
};

export const updateDocumentType = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const docType = await kycReqService.updateDocumentType(req.params.id, req.body, adminUserId);
    return successResponse(res, 200, 'KYC document type updated successfully', docType);
  } catch (error) {
    next(error);
  }
};

export const deleteDocumentType = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const result = await kycReqService.deleteDocumentType(req.params.id, adminUserId);
    return successResponse(res, 200, result.message, result);
  } catch (error) {
    next(error);
  }
};

// ── Category Document Requirements ──────────────────────────────────────────

export const getCategoryRequirements = async (req, res, next) => {
  try {
    const categoryId = parseInt(req.params.categoryId, 10);
    if (!categoryId || isNaN(categoryId)) {
      return errorResponse(res, 400, 'Invalid category ID');
    }
    const includeInactive = req.query.include_inactive === 'true' || req.query.all === 'true';
    const result = await kycReqService.getCategoryRequirements(categoryId, { includeInactive });
    return successResponse(res, 200, 'Category document requirements fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

export const addCategoryRequirement = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const categoryId = parseInt(req.params.categoryId, 10);
    if (!categoryId || isNaN(categoryId)) {
      return errorResponse(res, 400, 'Invalid category ID');
    }
    const requirement = await kycReqService.addCategoryRequirement(categoryId, req.body, adminUserId);
    return successResponse(res, 201, 'Category document requirement added successfully', requirement);
  } catch (error) {
    next(error);
  }
};

export const updateCategoryRequirement = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const requirementId = parseInt(req.params.requirementId, 10);
    if (!requirementId || isNaN(requirementId)) {
      return errorResponse(res, 400, 'Invalid requirement ID');
    }
    const requirement = await kycReqService.updateCategoryRequirement(requirementId, req.body, adminUserId);
    return successResponse(res, 200, 'Category document requirement updated successfully', requirement);
  } catch (error) {
    next(error);
  }
};

export const deleteCategoryRequirement = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const requirementId = parseInt(req.params.requirementId, 10);
    if (!requirementId || isNaN(requirementId)) {
      return errorResponse(res, 400, 'Invalid requirement ID');
    }
    await kycReqService.deleteCategoryRequirement(requirementId, adminUserId);
    return successResponse(res, 200, 'Category document requirement deleted successfully');
  } catch (error) {
    next(error);
  }
};

export const setCategoryKycConfigured = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const categoryId = parseInt(req.params.categoryId, 10);
    if (!categoryId || isNaN(categoryId)) {
      return errorResponse(res, 400, 'Invalid category ID');
    }
    const isConfigured = req.body.kyc_configured !== undefined ? Boolean(req.body.kyc_configured) : true;
    const category = await kycReqService.setCategoryKycConfigured(categoryId, isConfigured, adminUserId);
    return successResponse(res, 200, 'Category KYC configured status updated successfully', category);
  } catch (error) {
    next(error);
  }
};

// ── Subcategory Requests Workflow ───────────────────────────────────────────

export const requestSubcategory = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }
    const request = await kycReqService.requestSubcategory(userId, req.body);
    return successResponse(res, 201, 'Subcategory request submitted successfully for admin review', request);
  } catch (error) {
    next(error);
  }
};

export const listSubcategoryRequests = async (req, res, next) => {
  try {
    const options = {
      status: req.query.status,
      categoryId: req.query.category_id ? parseInt(req.query.category_id, 10) : undefined,
      providerId: req.query.provider_id ? parseInt(req.query.provider_id, 10) : undefined,
    };
    const requests = await kycReqService.listSubcategoryRequests(options);
    return successResponse(res, 200, 'Subcategory requests fetched successfully', requests);
  } catch (error) {
    next(error);
  }
};

export const reviewSubcategoryRequest = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const requestId = parseInt(req.params.id, 10);
    if (!requestId || isNaN(requestId)) {
      return errorResponse(res, 400, 'Invalid request ID');
    }
    const result = await kycReqService.reviewSubcategoryRequest(requestId, req.body, adminUserId);
    return successResponse(res, 200, 'Subcategory request reviewed successfully', result);
  } catch (error) {
    next(error);
  }
};
