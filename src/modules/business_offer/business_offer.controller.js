import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessOfferService from './business_offer.service.js';

export const createOffer = async (req, res, next) => {
  try {
    const offer = await businessOfferService.createOffer(req.body);
    return successResponse(res, 201, 'Business offer added successfully', offer);
  } catch (error) {
    next(error);
  }
};

export const getAllOffers = async (req, res, next) => {
  try {
    const offers = await businessOfferService.getAllOffers();
    return successResponse(res, 200, 'Business offers fetched successfully', offers);
  } catch (error) {
    next(error);
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
    next(error);
  }
};

export const updateOffer = async (req, res, next) => {
  try {
    const offer = await businessOfferService.updateOffer(req.params.id, req.body);
    if (!offer) {
      return errorResponse(res, 404, 'Business offer not found');
    }
    return successResponse(res, 200, 'Business offer updated successfully', offer);
  } catch (error) {
    next(error);
  }
};

export const deleteOffer = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const offer = await businessOfferService.softDeleteOffer(req.params.id, deletedRemarks, updated_by);
    if (!offer) {
      return errorResponse(res, 404, 'Business offer not found');
    }
    return successResponse(res, 200, 'Business offer deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};
