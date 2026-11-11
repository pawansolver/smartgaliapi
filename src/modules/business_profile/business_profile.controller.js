import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessProfileService from './business_profile.service.js';
import * as businessFollowService from './business_follow.service.js';
import { getPublicSearchSuggestions } from '../business_product/business_product.service.js';

export const createProfile = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.user?.id && !data.userId && !data.user_id) {
      data.userId = req.user.id;
      data.created_by = data.created_by || req.user.id;
    }
    if (req.file) {
      data.logo = req.file.path.replace(/\\/g, '/');
    }
    const profile = await businessProfileService.createProfile(data);
    return successResponse(res, 201, 'Business profile created successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const getAllProfiles = async (req, res, next) => {
  try {
    const profiles = await businessProfileService.getAllProfiles({
      ...req.query,
      _viewerUserId: req.user?.id || req.user?.userId || null,
    });
    return successResponse(res, 200, 'Business profiles fetched successfully', profiles);
  } catch (error) {
    next(error);
  }
};

export const resolvePinLocation = async (req, res, next) => {
  try {
    const resolved = await businessProfileService.resolvePinLocation(req.query);
    return successResponse(res, 200, 'Pin coordinates resolved successfully', resolved);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Valid latitude and longitude are required');
  }
};

export const getNearbyBusinesses = async (req, res, next) => {
  try {
    const result = await businessProfileService.getNearbyBusinesses({
      ...req.query,
      _viewerUserId: req.user?.id || req.user?.userId || null,
    });
    return successResponse(res, 200, 'Nearby businesses fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getSearchSuggestions = async (req, res, next) => {
  try {
    const result = await getPublicSearchSuggestions({
      ...req.query,
      _viewerUserId: req.user?.id || req.user?.userId || null,
    });
    return successResponse(res, 200, 'Search suggestions fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getMyProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return errorResponse(res, 401, 'Authentication required');
    }
    const profile = await businessProfileService.getProfileByUserId(userId);
    if (!profile) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business profile fetched successfully', profile);
  } catch (error) {
    next(error);
  }
};

export const getProfileById = async (req, res, next) => {
  try {
    const profile = await businessProfileService.getProfileById(req.params.id, {
      ...req.query,
      _viewerUserId: req.user?.id || req.user?.userId || null,
    });
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
    if (req.user?.id && !data.updated_by) {
      data.updated_by = req.user.id;
    }
    if (req.file) {
      data.logo = req.file.path.replace(/\\/g, '/');
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

export const getBusinessCoverage = async (req, res, next) => {
  try {
    const coverage = await businessProfileService.getBusinessCoverage(req.params.id);
    if (!coverage) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business coverage fetched successfully', coverage);
  } catch (error) {
    next(error);
  }
};

export const updateBusinessCoverage = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.body?.updated_by || null;
    const coverage = await businessProfileService.updateBusinessCoverage(
      req.params.id,
      req.body,
      actorUserId
    );
    if (!coverage) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Business location & coverage updated successfully', coverage);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to update business coverage');
  }
};

export const requestSocietyAccess = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || null;
    const access = await businessProfileService.requestSocietyAccess(
      req.params.id,
      req.body,
      actorUserId
    );
    if (!access) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 201, 'Society access request submitted successfully', access);
  } catch (error) {
    return errorResponse(res, 400, error.message || 'Failed to request society access');
  }
};

export const listBusinessSocietyAccess = async (req, res, next) => {
  try {
    const list = await businessProfileService.listBusinessSocietyAccess(req.params.id);
    if (!list) {
      return errorResponse(res, 404, 'Business profile not found');
    }
    return successResponse(res, 200, 'Society access statuses fetched successfully', list);
  } catch (error) {
    next(error);
  }
};

export const listSocietyBusinessRequests = async (req, res, next) => {
  try {
    const societyId = Number(req.societyId || req.query.society_id || req.headers['x-society-id']);
    if (!societyId) {
      return errorResponse(res, 400, 'society_id is required.');
    }
    const list = await businessProfileService.listSocietyBusinessRequests(societyId, req.query.status);
    return successResponse(res, 200, 'Society business requests fetched successfully', list);
  } catch (error) {
    next(error);
  }
};

const handleReviewAction = (action) => async (req, res) => {
  try {
    const reviewerId = req.user?.id || null;
    const updated = await businessProfileService.reviewSocietyAccess(
      req.params.accessId,
      action,
      reviewerId,
      req.body || {}
    );
    return successResponse(res, 200, `Society business access ${action}d successfully`, updated);
  } catch (error) {
    return errorResponse(res, 400, error.message || `Failed to ${action} society access`);
  }
};

export const approveSocietyAccess = handleReviewAction('approve');
export const rejectSocietyAccess = handleReviewAction('reject');
export const suspendSocietyAccess = handleReviewAction('suspend');
export const revokeSocietyAccess = handleReviewAction('revoke');

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

export const followBusiness = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const notify = req.body?.notify_updates ?? req.body?.notifyUpdates ?? true;
    const data = await businessFollowService.followBusiness(req.params.id, userId, notify);
    return successResponse(res, 200, 'Shop followed successfully', data);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};

export const unfollowBusiness = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const data = await businessFollowService.unfollowBusiness(req.params.id, userId);
    return successResponse(res, 200, 'Shop unfollowed successfully', data);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};

export const getFollowedBusinesses = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const data = await businessFollowService.getFollowedBusinesses(
      userId,
      req.query,
      businessProfileService.formatBusinessProfile
    );
    return successResponse(res, 200, 'Followed businesses fetched successfully', data);
  } catch (error) {
    next(error);
  }
};

export const getFollowedBusinessUpdates = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) return errorResponse(res, 401, 'Authentication required');
    const data = await businessFollowService.getFollowedBusinessUpdates(userId, req.query);
    return successResponse(res, 200, 'Followed shop updates fetched successfully', data);
  } catch (error) {
    next(error);
  }
};
