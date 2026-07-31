import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessProfileService from './business_profile.service.js';
import { getImageUrl } from '../../utils/fileUpload.js';

export const createProfile = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.logo = getImageUrl(req, req.file, 'business');
    }
    const profile = await businessProfileService.createProfile(data);
    return successResponse(res, 201, 'Business profile created successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const getAllProfiles = async (req, res, next) => {
  try {
    const profiles = await businessProfileService.getAllProfiles(req.query);
    return successResponse(res, 200, 'Business profiles fetched successfully', profiles);
  } catch (error) {
    next(error);
  }
};

export const getProfileById = async (req, res, next) => {
  try {
    const profile = await businessProfileService.getProfileById(req.params.id);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile fetched successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.logo = getImageUrl(req, req.file, 'business');
    }
    const profile = await businessProfileService.updateProfile(req.params.id, data);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile updated successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const deleteProfile = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const profile = await businessProfileService.softDeleteProfile(req.params.id, deletedRemarks, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const approveProfile = async (req, res, next) => {
  try {
    const { updated_by } = req.body;
    const profile = await businessProfileService.approveProfile(req.params.id, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile approved successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const rejectProfile = async (req, res, next) => {
  try {
    const { rejectRemarks, updated_by } = req.body;
    const profile = await businessProfileService.rejectProfile(req.params.id, rejectRemarks, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile rejected successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const featureProfile = async (req, res, next) => {
  try {
    const { updated_by } = req.body;
    const profile = await businessProfileService.featureProfile(req.params.id, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile featured successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const unfeatureProfile = async (req, res, next) => {
  try {
    const { updated_by } = req.body;
    const profile = await businessProfileService.unfeatureProfile(req.params.id, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile unfeatured successfully', profile);
  } catch (error) {
    next(error);
  }
};
