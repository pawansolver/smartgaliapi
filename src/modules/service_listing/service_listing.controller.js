import { evaluateLiveCoverage } from './service_coverage.service.js';
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
    const listings = await serviceListingService.getMyListings(req.user);
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

export const calculatePrice = async (req, res, next) => {
  try {
    const listingId = req.params.id;
    const { package_id, addon_ids, duration_hours, material_charge, discount_amount, tax_rate, platform_fee } = req.body;
    const calculation = await serviceListingService.calculateAuthoritativeServicePrice({
      listingId,
      packageId: package_id,
      addonIds: addon_ids,
      durationHours: duration_hours,
      materialCharge: material_charge,
      discountAmount: discount_amount,
      taxRate: tax_rate !== undefined ? Number(tax_rate) : 0.03,
      platformFee: platform_fee !== undefined ? Number(platform_fee) : 29.00,
    });
    return successResponse(res, 200, 'Authoritative service price calculated successfully', calculation);
  } catch (error) {
    next(error);
  }
};


// ── Step 5: Enterprise Media & KYC Controller Methods ────────────────────────

export const uploadListingMedia = async (req, res, next) => {
  try {
    const file = req.file || (req.files?.photo?.[0]) || (req.files?.image?.[0]) || (req.files?.file?.[0]);
    const media = await serviceListingService.uploadServiceListingMedia(req.params.id, req.user, file, req.body);
    return successResponse(res, 201, 'Portfolio photo uploaded successfully', media);
  } catch (error) {
    if (error.statusCode === 403 || (error.message && error.message.startsWith('Forbidden'))) {
      return errorResponse(res, 403, error.message);
    }
    next(error);
  }
};

export const getListingMedia = async (req, res, next) => {
  try {
    const media = await serviceListingService.getServiceListingMedia(req.params.id, req.user);
    return successResponse(res, 200, 'Service portfolio photos fetched successfully', media);
  } catch (error) {
    next(error);
  }
};

export const deleteListingMedia = async (req, res, next) => {
  try {
    const result = await serviceListingService.deleteServiceListingMedia(req.params.id, req.params.mediaId, req.user);
    return successResponse(res, 200, result.message || 'Portfolio photo deleted successfully');
  } catch (error) {
    if (error.statusCode === 403 || (error.message && error.message.startsWith('Forbidden'))) {
      return errorResponse(res, 403, error.message);
    }
    next(error);
  }
};

export const getListingKycStatus = async (req, res, next) => {
  try {
    const kycStatus = await serviceListingService.getServiceListingKycStatus(req.params.id, req.user);
    return successResponse(res, 200, 'Service KYC verification status retrieved successfully', kycStatus);
  } catch (error) {
    if (error.statusCode === 403 || (error.message && error.message.startsWith('Forbidden'))) {
      return errorResponse(res, 403, error.message);
    }
    next(error);
  }
};

export const submitListingForReview = async (req, res, next) => {
  try {
    const listing = await serviceListingService.submitServiceListingForReview(req.params.id, req.user);
    return successResponse(res, 200, 'Service listing submitted for review successfully', listing);
  } catch (error) {
    if (error.statusCode === 403 || (error.message && error.message.startsWith('Forbidden'))) {
      return errorResponse(res, 403, error.message);
    }
    next(error);
  }
};


export const toggleListingStatus = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const { is_available } = req.body;
    const listing = await serviceListingService.adminToggleListingStatus(req.params.id, is_available, actorId);
    return successResponse(res, 200, 'Service listing status updated successfully', listing);
  } catch (error) {
    next(error);
  }
};

export const checkCoverage = async (req, res, next) => {
  try {
    const listingId = req.params.id;
    const customerLocation = {
      ...req.query,
      ...req.body,
    };
    const coverage = await evaluateLiveCoverage({
      listingId,
      customerLocation,
    });
    return successResponse(res, 200, 'Live coverage evaluated successfully', coverage);
  } catch (error) {
    next(error);
  }
};
