import * as eventCategoryService from './event_category.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { getImageUrl } from '../../utils/fileUpload.js';

export const createEventCategory = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.icon = getImageUrl(req, 'eventCategory', req.file.filename);
    }
    const category = await eventCategoryService.createEventCategory(data);
    return successResponse(res, 201, 'Event category created successfully', category);
  } catch (error) {
    next(error);
  }
};

export const getAllEventCategories = async (req, res, next) => {
  try {
    const categories = await eventCategoryService.getAllEventCategories();
    return successResponse(res, 200, 'Event categories fetched successfully', categories);
  } catch (error) {
    next(error);
  }
};

export const getEventCategoryById = async (req, res, next) => {
  try {
    const category = await eventCategoryService.getEventCategoryById(req.params.id);
    if (!category) return errorResponse(res, 404, 'Event category not found');
    return successResponse(res, 200, 'Event category fetched successfully', category);
  } catch (error) {
    next(error);
  }
};

export const updateEventCategory = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.icon = getImageUrl(req, 'eventCategory', req.file.filename);
    }
    const category = await eventCategoryService.updateEventCategory(req.params.id, data);
    if (!category) return errorResponse(res, 404, 'Event category not found');
    return successResponse(res, 200, 'Event category updated successfully', category);
  } catch (error) {
    next(error);
  }
};

export const deleteEventCategory = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const category = await eventCategoryService.deleteEventCategory(req.params.id, deletedRemarks, updated_by);
    if (!category) return errorResponse(res, 404, 'Event category not found');
    return successResponse(res, 200, 'Event category deleted successfully');
  } catch (error) {
    next(error);
  }
};
