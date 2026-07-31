import { successResponse, errorResponse } from '../../utils/response.js';
import { getImageUrl } from '../../utils/fileUpload.js';
import * as communityCategoryService from './communityCategory.service.js';

export const createCommunityCategory = async (req, res, next) => {
  try {
    const categoryData = { ...req.body };

    // Set icon path if a file was uploaded
    if (req.file) {
      categoryData.communityCategoryIcon = getImageUrl(req, req.file, 'communityCategory');
    }

    const category = await communityCategoryService.createCommunityCategory(categoryData);
    return successResponse(res, 201, 'Community Category created successfully', category);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return errorResponse(res, 400, 'Community Category name already exists');
    }
    next(error);
  }
};

export const getAllCommunityCategories = async (req, res, next) => {
  try {
    const categories = await communityCategoryService.getAllCommunityCategories();
    return successResponse(res, 200, 'Community Categories fetched successfully', categories);
  } catch (error) {
    next(error);
  }
};

export const getCommunityCategoryById = async (req, res, next) => {
  try {
    const category = await communityCategoryService.getCommunityCategoryById(req.params.id);
    if (!category) {
      return errorResponse(res, 404, 'Community Category not found');
    }
    return successResponse(res, 200, 'Community Category fetched successfully', category);
  } catch (error) {
    next(error);
  }
};

export const updateCommunityCategory = async (req, res, next) => {
  try {
    const updateData = { ...req.body };

    // Set new icon path if a new file was uploaded
    if (req.file) {
      updateData.communityCategoryIcon = getImageUrl(req, req.file, 'communityCategory');
    }

    const category = await communityCategoryService.updateCommunityCategory(req.params.id, updateData);
    if (!category) {
      return errorResponse(res, 404, 'Community Category not found');
    }
    return successResponse(res, 200, 'Community Category updated successfully', category);
  } catch (error) {
    next(error);
  }
};

export const deleteCommunityCategory = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const category = await communityCategoryService.softDeleteCommunityCategory(req.params.id, deletedRemarks, updated_by);
    if (!category) {
      return errorResponse(res, 404, 'Community Category not found');
    }
    return successResponse(res, 200, 'Community Category deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};
