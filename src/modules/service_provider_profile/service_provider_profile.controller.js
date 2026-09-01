import { successResponse, errorResponse } from '../../utils/response.js';
import * as serviceProviderProfileService from './service_provider_profile.service.js';

export const createProfile = async (req, res, next) => {
  try {
    const profile = await serviceProviderProfileService.createProfile(req.body);
    return successResponse(res, 201, 'Service provider profile created successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const getAllProfiles = async (req, res, next) => {
  try {
    const profiles = await serviceProviderProfileService.getAllProfiles();
    return successResponse(res, 200, 'Service provider profiles fetched successfully', profiles);
  } catch (error) {
    next(error);
  }
};

export const getProfileById = async (req, res, next) => {
  try {
    const profile = await serviceProviderProfileService.getProfileById(req.params.id);
    if (!profile) {
      return errorResponse(res, 404, 'Service provider profile not found');
    }
    return successResponse(res, 200, 'Service provider profile fetched successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const profile = await serviceProviderProfileService.updateProfile(req.params.id, req.body);
    if (!profile) {
      return errorResponse(res, 404, 'Service provider profile not found');
    }
    return successResponse(res, 200, 'Service provider profile updated successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const deleteProfile = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const profile = await serviceProviderProfileService.softDeleteProfile(req.params.id, deletedRemarks, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Service provider profile not found');
    }
    return successResponse(res, 200, 'Service provider profile deleted successfully (soft delete)', null);
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
    const result = await serviceProviderProfileService.bulkSoftDeleteProfiles(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Service provider profiles deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};

export const getPendingVerifications = async (req, res, next) => {
  try {
    const profiles = await serviceProviderProfileService.getPendingVerifications();
    return successResponse(res, 200, 'Pending service verifications fetched successfully', profiles);
  } catch (error) {
    next(error);
  }
};

export const verifyProfile = async (req, res, next) => {
  try {
    const updated_by = req.body.updated_by || 'admin';
    const profile = await serviceProviderProfileService.verifyProfile(req.params.id, updated_by);
    if (!profile) {
      return errorResponse(res, 404, 'Service provider profile not found');
    }
    return successResponse(res, 200, 'Service provider profile verified successfully', profile);
  } catch (error) {
    next(error);
  }
};
