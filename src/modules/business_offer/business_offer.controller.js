import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessOfferService from './business_offer.service.js';

const handleServiceError = (res, error, next) => {
  if (error?.statusCode) {
    return errorResponse(res, error.statusCode, error.message, error.errors || null);
  }
  return next(error);
};

export const createOffer = async (req, res, next) => {
  try {
    const offer = await businessOfferService.createOffer(req.body);
    return successResponse(res, 201, 'Business offer campaign created successfully', offer);
  } catch (error) {
    return handleServiceError(res, error, next);
  }
};

export const previewOfferCampaign = async (req, res, next) => {
  try {
    const preview = await businessOfferService.previewOfferCampaign(req.body);
    return successResponse(res, 200, 'Offer campaign preview computed successfully', preview);
  } catch (error) {
    return handleServiceError(res, error, next);
  }
};

export const getEligibleCatalogForOffers = async (req, res, next) => {
  try {
    const catalog = await businessOfferService.getEligibleCatalogForOffers(req.params.businessId);
    return successResponse(res, 200, 'Eligible offer catalog loaded successfully', catalog);
  } catch (error) {
    return handleServiceError(res, error, next);
  }
};

export const getAllOffers = async (req, res, next) => {
  try {
    const offers = await businessOfferService.getAllOffers();
    return successResponse(res, 200, 'Business offers fetched successfully', offers);
  } catch (error) {
    return handleServiceError(res, error, next);
  }
};

export const getOffersByBusiness = async (req, res, next) => {
  try {
    const activeOnly =
      req.query.activeOnly === 'true' ||
      req.query.active_only === 'true' ||
      req.query.activeOnly === '1';
    const offers = await businessOfferService.getOffersByBusiness(req.params.businessId, {
      activeOnly,
    });
    return successResponse(res, 200, 'Business offers fetched successfully', offers);
  } catch (error) {
    return handleServiceError(res, error, next);
  }
};

export const getOfferById = async (req, res, next) => {
  try {
    const offer = await businessOfferService.getOfferById(req.params.id);
    if (!offer) {
      return errorResponse(res, 404, 'Business offer not found');
    }
    return successResponse(res, 200, 'Business offer fetched successfully', offer);
  } catch (error) {
    return handleServiceError(res, error, next);
  }
};

export const updateOffer = async (req, res, next) => {
  try {
    const offer = await businessOfferService.updateOffer(req.params.id, req.body);
    if (!offer) {
      return errorResponse(res, 404, 'Business offer not found');
    }
    return successResponse(res, 200, 'Business offer campaign updated successfully', offer);
  } catch (error) {
    return handleServiceError(res, error, next);
  }
};

export const toggleOfferStatus = async (req, res, next) => {
  try {
    const nextState = req.body?.is_active ?? req.body?.isActive;
    const offer = await businessOfferService.toggleOfferStatus(req.params.id, nextState);
    if (!offer) {
      return errorResponse(res, 404, 'Business offer not found');
    }
    return successResponse(res, 200, 'Business offer status updated', offer);
  } catch (error) {
    return handleServiceError(res, error, next);
  }
};

export const deleteOffer = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body || {};
    const offer = await businessOfferService.softDeleteOffer(req.params.id, deletedRemarks, updated_by);
    if (!offer) {
      return errorResponse(res, 404, 'Business offer not found');
    }
    return successResponse(res, 200, 'Business offer deleted successfully (soft delete)', null);
  } catch (error) {
    return handleServiceError(res, error, next);
  }
};
