import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyProfileService from './society_profile.service.js';

export const createProfile = async (req, res, next) => {
  try {
    const profile = await societyProfileService.createProfile(req.body);
    return successResponse(res, 201, 'Society profile created successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const getAllProfiles = async (req, res, next) => {
  try {
    const profiles = await societyProfileService.getAllProfiles();
    return successResponse(res, 200, 'Society profiles fetched successfully', profiles);
  } catch (error) {
    next(error);
  }
};

export const getProfileById = async (req, res, next) => {
  try {
    const profile = await societyProfileService.getProfileById(req.params.id);
    if (!profile) {
      return errorResponse(res, 404, 'Society profile not found');
    }
    return successResponse(res, 200, 'Society profile fetched successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const profile = await societyProfileService.updateProfile(req.params.id, req.body);
    if (!profile) {
      return errorResponse(res, 404, 'Society profile not found');
    }
    return successResponse(res, 200, 'Society profile updated successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const deleteProfile = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const profile = await societyProfileService.softDeleteProfile(req.params.id, deletedRemarks, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Society profile not found');
    }
    return successResponse(res, 200, 'Society profile deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteProfiles = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await societyProfileService.bulkSoftDeleteProfiles(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Society profiles deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
