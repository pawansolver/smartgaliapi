import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyFacilityService from './society_facility.service.js';

export const createFacility = async (req, res, next) => {
  try {
    const facility = await societyFacilityService.createFacility(req.body);
    return successResponse(res, 201, 'Society facility created successfully', facility);
  } catch (error) {
    next(error);
  }
};

export const getAllFacilities = async (req, res, next) => {
  try {
    const facilities = await societyFacilityService.getAllFacilities();
    return successResponse(res, 200, 'Society facilities fetched successfully', facilities);
  } catch (error) {
    next(error);
  }
};

export const getFacilityById = async (req, res, next) => {
  try {
    const facility = await societyFacilityService.getFacilityById(req.params.id);
    if (!facility) {
      return errorResponse(res, 404, 'Society facility not found');
    }
    return successResponse(res, 200, 'Society facility fetched successfully', facility);
  } catch (error) {
    next(error);
  }
};

export const updateFacility = async (req, res, next) => {
  try {
    const facility = await societyFacilityService.updateFacility(req.params.id, req.body);
    if (!facility) {
      return errorResponse(res, 404, 'Society facility not found');
    }
    return successResponse(res, 200, 'Society facility updated successfully', facility);
  } catch (error) {
    next(error);
  }
};

export const deleteFacility = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const facility = await societyFacilityService.softDeleteFacility(req.params.id, deletedRemarks, updated_by);
    if (!facility) {
      return errorResponse(res, 404, 'Society facility not found');
    }
    return successResponse(res, 200, 'Society facility deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteFacilities = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await societyFacilityService.bulkSoftDeleteFacilities(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Society facilities deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
