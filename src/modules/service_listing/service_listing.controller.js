import { successResponse, errorResponse } from '../../utils/response.js';
import * as serviceListingService from './service_listing.service.js';
import { toPublicServiceListing } from './service_listing.projection.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';

export const createListing = async (req, res, next) => {
  try {
    const listing = await serviceListingService.createListing(req.body, req.user);
    return successResponse(res, 201, 'Service listing created successfully', listing);
  } catch (error) {
    next(error);
  }
};

export const getMyListings = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const listings = await serviceListingService.getMyListings(userId);
    return successResponse(res, 200, 'Provider listings fetched successfully', listings);
  } catch (error) {
    next(error);
  }
};

export const getAllListings = async (req, res, next) => {
  try {
    const result = await serviceListingService.getAllListings(req.query);
    const isAdmin = isGlobalAdminUser(req.user);
    // Public projection for guest and resident users
    const items = isAdmin ? result.rows : result.rows.map(toPublicServiceListing);
    return successResponse(res, 200, 'Service listings fetched successfully', items);
  } catch (error) {
    next(error);
  }
};

export const getAdminAllListings = async (req, res, next) => {
  try {
    const result = await serviceListingService.getAdminAllListings(req.query);
    return successResponse(res, 200, 'Admin service listings fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getListingById = async (req, res, next) => {
  try {
    const listing = await serviceListingService.getListingById(req.params.id);
    if (!listing) {
      return errorResponse(res, 404, 'Service listing not found');
    }

    const isAdmin = isGlobalAdminUser(req.user);
    const isOwner = req.user && listing.provider?.user_id === (req.user.id || req.user.userId);

    // If listing is not approved/active and viewer is not owner or admin, return 404
    if (!isAdmin && !isOwner && (listing.moderation_status !== 'approved' || !listing.is_available)) {
      return errorResponse(res, 404, 'Service listing is currently unavailable');
    }

    const data = (isAdmin || isOwner) ? listing : toPublicServiceListing(listing);
    return successResponse(res, 200, 'Service listing fetched successfully', data);
  } catch (error) {
    next(error);
  }
};

export const updateListing = async (req, res, next) => {
  try {
    const listing = await serviceListingService.updateListing(req.params.id, req.body, req.user);
    if (!listing) {
      return errorResponse(res, 404, 'Service listing not found');
    }
    return successResponse(res, 200, 'Service listing updated successfully', listing);
  } catch (error) {
    if (error.message && error.message.startsWith('Forbidden')) {
      return errorResponse(res, 403, error.message);
    }
    next(error);
  }
};

export const pauseListing = async (req, res, next) => {
  try {
    const listing = await serviceListingService.pauseListing(req.params.id, req.user);
    if (!listing) {
      return errorResponse(res, 404, 'Service listing not found');
    }
    return successResponse(res, 200, 'Service listing paused successfully', listing);
  } catch (error) {
    if (error.message && error.message.startsWith('Forbidden')) {
      return errorResponse(res, 403, error.message);
    }
    next(error);
  }
};

export const resumeListing = async (req, res, next) => {
  try {
    const listing = await serviceListingService.resumeListing(req.params.id, req.user);
    if (!listing) {
      return errorResponse(res, 404, 'Service listing not found');
    }
    return successResponse(res, 200, 'Service listing resumed successfully', listing);
  } catch (error) {
    if (error.message && error.message.startsWith('Forbidden')) {
      return errorResponse(res, 403, error.message);
    }
    next(error);
  }
};

export const moderateListing = async (req, res, next) => {
  try {
    const adminUserId = req.user?.id || req.user?.userId;
    const listing = await serviceListingService.moderateListing(req.params.id, req.body, adminUserId);
    if (!listing) {
      return errorResponse(res, 404, 'Service listing not found');
    }
    return successResponse(res, 200, 'Service listing moderated successfully', listing);
  } catch (error) {
    next(error);
  }
};

export const deleteListing = async (req, res, next) => {
  try {
    const { deletedRemarks } = req.body;
    const listing = await serviceListingService.softDeleteListing(req.params.id, deletedRemarks, req.user);
    if (!listing) {
      return errorResponse(res, 404, 'Service listing not found');
    }
    return successResponse(res, 200, 'Service listing deleted successfully', null);
  } catch (error) {
    if (error.message && error.message.startsWith('Forbidden')) {
      return errorResponse(res, 403, error.message);
    }
    next(error);
  }
};

export const bulkDeleteListings = async (req, res, next) => {
  try {
    const { ids, deletedRemarks } = req.body;
    const updated_by = req.user?.id || req.user?.userId;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await serviceListingService.bulkSoftDeleteListings(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Service listings deleted successfully', result);
  } catch (error) {
    next(error);
  }
};
