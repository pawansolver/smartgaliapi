import { successResponse, errorResponse } from '../../utils/response.js';
import { getImageUrl } from '../../utils/fileUpload.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';
import * as businessCategoryService from './business_category.service.js';
import * as searchIntelligence from './business_search_intelligence.service.js';
import { DEFAULT_SYNONYMS_BY_CANONICAL } from './category_matcher.helper.js';

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

export const getCategoryTemplates = async (req, res, next) => {
  try {
    const templates = await businessCategoryService.getCategoryTemplates();
    return successResponse(res, 200, 'Category dynamic specification templates fetched successfully', templates);
  } catch (error) {
    next(error);
  }
};

export const getCategorySpecifications = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await businessCategoryService.getCategorySpecifications(id);
    return successResponse(res, 200, 'Category specifications fetched successfully', template);
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

export const listSearchSynonyms = async (req, res, next) => {
  try {
    const includeInactive =
      req.query.include_inactive === 'true' && isGlobalAdminUser(req.user);
    const rows = await searchIntelligence.listSearchSynonyms({
      includeInactive,
      canonicalKey: req.query.canonical_key || null,
      search: req.query.search || null,
    });
    return successResponse(res, 200, 'Search synonyms fetched successfully', {
      total: rows.length,
      canonical_keys: Object.keys(DEFAULT_SYNONYMS_BY_CANONICAL),
      synonyms: rows,
    });
  } catch (error) {
    next(error);
  }
};

export const createSearchSynonym = async (req, res, next) => {
  try {
    const created = await searchIntelligence.createSearchSynonym(
      req.body,
      req.user?.id || req.user?.userId || null
    );
    return successResponse(res, 201, 'Search synonym saved successfully', created);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Unable to save search synonym');
  }
};

export const updateSearchSynonym = async (req, res, next) => {
  try {
    const updated = await searchIntelligence.updateSearchSynonym(
      req.params.synonymId,
      req.body,
      req.user?.id || req.user?.userId || null
    );
    if (!updated) {
      return errorResponse(res, 404, 'Search synonym not found');
    }
    return successResponse(res, 200, 'Search synonym updated successfully', updated);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Unable to update search synonym');
  }
};

export const deleteSearchSynonym = async (req, res, next) => {
  try {
    const deleted = await searchIntelligence.deleteSearchSynonym(
      req.params.synonymId,
      req.user?.id || req.user?.userId || null
    );
    if (!deleted) {
      return errorResponse(res, 404, 'Search synonym not found');
    }
    return successResponse(res, 200, 'Search synonym deleted successfully', null);
  } catch (error) {
    next(error);
  }
};

export const getSearchAnalytics = async (req, res, next) => {
  try {
    const summary = await searchIntelligence.getSearchAnalyticsSummary({
      days: req.query.days,
      limit: req.query.limit,
    });
    return successResponse(res, 200, 'Search analytics fetched successfully', summary);
  } catch (error) {
    next(error);
  }
};
