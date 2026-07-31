import { successResponse, errorResponse } from '../../utils/response.js';
import * as serviceListingService from './service_listing.service.js';

export const createListing = async (req, res, next) => {
  try {
    const listing = await serviceListingService.createListing(req.body);
    return successResponse(res, 201, 'Service listing created successfully', listing);
  } catch (error) {
    next(error);
  }
};

export const getAllListings = async (req, res, next) => {
  try {
    const listings = await serviceListingService.getAllListings();
    return successResponse(res, 200, 'Service listings fetched successfully', listings);
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
    return successResponse(res, 200, 'Service listing fetched successfully', listing);
  } catch (error) {
    next(error);
  }
};

export const updateListing = async (req, res, next) => {
  try {
    const listing = await serviceListingService.updateListing(req.params.id, req.body);
    if (!listing) {
      return errorResponse(res, 404, 'Service listing not found');
    }
    return successResponse(res, 200, 'Service listing updated successfully', listing);
  } catch (error) {
    next(error);
  }
};

export const deleteListing = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const listing = await serviceListingService.softDeleteListing(req.params.id, deletedRemarks, updated_by);
    if (!listing) {
      return errorResponse(res, 404, 'Service listing not found');
    }
    return successResponse(res, 200, 'Service listing deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteListings = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await serviceListingService.bulkSoftDeleteListings(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Service listings deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
