import { successResponse, errorResponse } from '../../utils/response.js';
import { getImageUrl } from '../../utils/fileUpload.js';
import * as communityService from './community.service.js';

export const createCommunity = async (req, res, next) => {
  try {
    const communityData = { ...req.body };

    // Set cover image path if a file was uploaded
    if (req.file) {
      communityData.cover_image = getImageUrl(req, req.file, 'community');
    }

    const community = await communityService.createCommunity(communityData);
    return successResponse(res, 201, 'Community created successfully', community);
  } catch (error) {
    next(error);
  }
};

export const getAllCommunities = async (req, res, next) => {
  try {
    const communities = await communityService.getAllCommunities();
    return successResponse(res, 200, 'Communities fetched successfully', communities);
  } catch (error) {
    next(error);
  }
};

export const getCommunityById = async (req, res, next) => {
  try {
    const community = await communityService.getCommunityById(req.params.id);
    if (!community) {
      return errorResponse(res, 404, 'Community not found');
    }
    return successResponse(res, 200, 'Community fetched successfully', community);
  } catch (error) {
    next(error);
  }
};

export const updateCommunity = async (req, res, next) => {
  try {
    const updateData = { ...req.body };

    // Set new cover image path if a new file was uploaded
    if (req.file) {
      updateData.cover_image = getImageUrl(req, req.file, 'community');
    }

    const community = await communityService.updateCommunity(req.params.id, updateData);
    if (!community) {
      return errorResponse(res, 404, 'Community not found');
    }
    return successResponse(res, 200, 'Community updated successfully', community);
  } catch (error) {
    next(error);
  }
};

export const deleteCommunity = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const community = await communityService.softDeleteCommunity(req.params.id, deletedRemarks, updated_by);
    if (!community) {
      return errorResponse(res, 404, 'Community not found');
    }
    return successResponse(res, 200, 'Community deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

// Join community
export const joinCommunity = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return errorResponse(res, 400, 'user_id is required');
    const member = await communityService.joinCommunity(req.params.id, user_id);
    return successResponse(res, 200, 'Joined community successfully', member);
  } catch (error) {
    next(error);
  }
};

// Leave community
export const leaveCommunity = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return errorResponse(res, 400, 'user_id is required');
    const member = await communityService.leaveCommunity(req.params.id, user_id);
    if (!member) return errorResponse(res, 404, 'You are not an active member of this community');
    return successResponse(res, 200, 'Left community successfully', null);
  } catch (error) {
    next(error);
  }
};

// Get members
export const getCommunityMembers = async (req, res, next) => {
  try {
    const members = await communityService.getCommunityMembers(req.params.id);
    return successResponse(res, 200, 'Members fetched successfully', members);
  } catch (error) {
    next(error);
  }
};

// Get My communities
export const getMyCommunities = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return errorResponse(res, 400, 'user_id query param is required');
    const communities = await communityService.getMyCommunities(user_id);
    return successResponse(res, 200, 'My communities fetched successfully', communities);
  } catch (error) {
    next(error);
  }
};

// Get Suggested communities
export const getSuggestedCommunities = async (req, res, next) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return errorResponse(res, 400, 'user_id query param is required');
    const communities = await communityService.getSuggestedCommunities(user_id);
    return successResponse(res, 200, 'Suggested communities fetched successfully', communities);
  } catch (error) {
    next(error);
  }
};

// Invite user
export const inviteUser = async (req, res, next) => {
  try {
    const { inviter_id, invitee_id } = req.body;
    if (!invitee_id) return errorResponse(res, 400, 'invitee_id is required');
    const invite = await communityService.inviteUser(req.params.id, inviter_id, invitee_id);
    return successResponse(res, 200, 'Invitation sent successfully', invite);
  } catch (error) {
    next(error);
  }
};

// Get pending communities
export const getPendingCommunities = async (req, res, next) => {
  try {
    const communities = await communityService.getPendingCommunities();
    return successResponse(res, 200, 'Pending communities fetched successfully', communities);
  } catch (error) {
    next(error);
  }
};

// Approve community
export const approveCommunity = async (req, res, next) => {
  try {
    const community = await communityService.approveCommunity(req.params.id);
    if (!community) {
      return errorResponse(res, 404, 'Community not found');
    }
    return successResponse(res, 200, 'Community approved successfully', community);
  } catch (error) {
    next(error);
  }
};

// Reject community
export const rejectCommunity = async (req, res, next) => {
  try {
    const community = await communityService.rejectCommunity(req.params.id);
    if (!community) {
      return errorResponse(res, 404, 'Community not found');
    }
    return successResponse(res, 200, 'Community rejected successfully', community);
  } catch (error) {
    next(error);
  }
};
