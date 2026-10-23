import { successResponse, errorResponse } from '../../utils/response.js';
import * as serviceProviderProfileService from './service_provider_profile.service.js';
import { toPublicProviderProfile } from '../service_listing/service_listing.projection.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';

export const getMyProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const profile = await serviceProviderProfileService.getOrCreateProviderProfile(userId);
    const formatted = await serviceProviderProfileService.formatProviderProfileResponse(profile);
    return successResponse(res, 200, 'Provider profile fetched successfully', formatted);
  } catch (error) {
    next(error);
  }
};

export const updateMyProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const profile = await serviceProviderProfileService.updateMyProfile(userId, req.body);
    const formatted = await serviceProviderProfileService.formatProviderProfileResponse(profile);
    return successResponse(res, 200, 'Provider profile updated successfully', formatted);
  } catch (error) {
    next(error);
  }
};

export const getMyServiceArea = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const serviceArea = await serviceProviderProfileService.getMyServiceArea(userId);
    return successResponse(res, 200, 'Service area fetched successfully', serviceArea);
  } catch (error) {
    next(error);
  }
};

export const updateMyServiceArea = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const serviceArea = await serviceProviderProfileService.updateMyServiceArea(userId, req.body);
    return successResponse(res, 200, 'Service area updated successfully', serviceArea);
  } catch (error) {
    next(error);
  }
};

export const getMyAvailability = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const availability = await serviceProviderProfileService.getMyAvailability(userId);
    return successResponse(res, 200, 'Availability schedule fetched successfully', availability);
  } catch (error) {
    next(error);
  }
};

export const updateMyAvailability = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const availability = await serviceProviderProfileService.updateMyAvailability(userId, req.body);
    return successResponse(res, 200, 'Availability schedule updated successfully', availability);
  } catch (error) {
    next(error);
  }
};

export const getMyOverviewStats = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const stats = await serviceProviderProfileService.getMyOverviewStats(userId);
    return successResponse(res, 200, 'Overview stats fetched successfully', stats);
  } catch (error) {
    next(error);
  }
};

export const getMyEarnings = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const earnings = await serviceProviderProfileService.getMyEarnings(userId);
    return successResponse(res, 200, 'Earnings fetched successfully', earnings);
  } catch (error) {
    next(error);
  }
};

// â”€â”€ Provider Documents (KYC) Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getMyDocuments = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const docs = await serviceProviderProfileService.getMyDocuments(userId);
    return successResponse(res, 200, 'Provider documents fetched successfully', docs);
  } catch (error) {
    next(error);
  }
};

export const uploadMyDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!req.file) {
      return errorResponse(res, 400, "No file provided. Send multipart/form-data with field name 'file' or 'document'.");
    }
    const doc = await serviceProviderProfileService.uploadMyDocument(userId, req.file, req.body);
    return successResponse(res, 201, 'Provider document uploaded successfully', doc);
  } catch (error) {
    next(error);
  }
};

export const deleteMyDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const success = await serviceProviderProfileService.deleteMyDocument(userId, req.params.documentId);
    if (!success) {
      return errorResponse(res, 404, 'Provider document not found');
    }
    return successResponse(res, 200, 'Provider document deleted successfully', null);
  } catch (error) {
    next(error);
  }
};

export const verifyProviderDocument = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const doc = await serviceProviderProfileService.verifyProviderDocument(req.params.documentId, req.body, adminUserId);
    if (!doc) {
      return errorResponse(res, 404, 'Provider document not found');
    }
    return successResponse(res, 200, 'Provider document verified successfully', doc);
  } catch (error) {
    next(error);
  }
};

// â”€â”€ Public / Shared / Admin Profile Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getAllProfiles = async (req, res, next) => {
  try {
    const result = await serviceProviderProfileService.getAllProfiles(req.query);
    const isAdmin = isGlobalAdminUser(req.user);
    if (!isAdmin) {
      result.rows = result.rows.map(toPublicProviderProfile);
    }
    return successResponse(res, 200, 'Service provider profiles fetched successfully', result);
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
    const isAdmin = isGlobalAdminUser(req.user);
    const isOwner = req.user && profile.user_id === (req.user.id || req.user.userId);
    const data = (isAdmin || isOwner) ? profile : toPublicProviderProfile(profile);
    return successResponse(res, 200, 'Service provider profile fetched successfully', data);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const target = await serviceProviderProfileService.getProfileById(req.params.id);
    if (!target) return errorResponse(res, 404, 'Service provider profile not found');

    const isAdmin = isGlobalAdminUser(req.user);
    const isOwner = req.user && target.user_id === (req.user.id || req.user.userId);
    if (!isAdmin && !isOwner) {
      return errorResponse(res, 403, 'Forbidden: You can only update your own provider profile');
    }

    const updated = await serviceProviderProfileService.updateProfile(req.params.id, req.body);
    return successResponse(res, 200, 'Service provider profile updated successfully', updated);
  } catch (error) {
    next(error);
  }
};

export const deleteProfile = async (req, res, next) => {
  try {
    const target = await serviceProviderProfileService.getProfileById(req.params.id);
    if (!target) return errorResponse(res, 404, 'Service provider profile not found');

    const isAdmin = isGlobalAdminUser(req.user);
    const isOwner = req.user && target.user_id === (req.user.id || req.user.userId);
    if (!isAdmin && !isOwner) {
      return errorResponse(res, 403, 'Forbidden: You can only delete your own provider profile');
    }

    const { deletedRemarks } = req.body;
    const updated_by = req.user?.id || req.user?.userId;
    await serviceProviderProfileService.softDeleteProfile(req.params.id, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Service provider profile deleted successfully', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteProfiles = async (req, res, next) => {
  try {
    const { ids, deletedRemarks } = req.body;
    const updated_by = req.user?.id || req.user?.userId;
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
    const adminUserId = req.user?.id || req.user?.userId;
    const profile = await serviceProviderProfileService.verifyProfile(req.params.id, req.body, adminUserId);
    if (!profile) {
      return errorResponse(res, 404, 'Service provider profile not found');
    }
    return successResponse(res, 200, 'Service provider profile verified successfully', profile);
  } catch (error) {
    next(error);
  }
};


export const getMyRequiredDocuments = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const result = await serviceProviderProfileService.getRequiredDocuments(userId);
    return successResponse(res, 200, 'Provider required documents checklist fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getProviderDocumentsForAdmin = async (req, res, next) => {
  try {
    const providerId = parseInt(req.params.id, 10);
    if (!providerId || isNaN(providerId)) {
      return errorResponse(res, 400, 'Invalid provider ID');
    }
    const result = await serviceProviderProfileService.getProviderDocumentsForAdmin(providerId);
    if (!result) {
      return errorResponse(res, 404, 'Service provider profile not found');
    }
    return successResponse(res, 200, 'Provider documents dossier fetched successfully', result);
  } catch (error) {
    next(error);
  }
};
