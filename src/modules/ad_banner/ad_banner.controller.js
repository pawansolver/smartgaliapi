import { successResponse, errorResponse } from '../../utils/response.js';
import * as adBannerService from './ad_banner.service.js';

export const createAdBanner = async (req, res, next) => {
  try {
    const banner = await adBannerService.createAdBanner(req.body);
    return successResponse(res, 201, 'Ad Banner created successfully', banner);
  } catch (error) {
    next(error);
  }
};

export const getAllAdBanners = async (req, res, next) => {
  try {
    const banners = await adBannerService.getAllAdBanners();
    return successResponse(res, 200, 'Ad Banners fetched successfully', banners);
  } catch (error) {
    next(error);
  }
};

export const getAdBannerById = async (req, res, next) => {
  try {
    const banner = await adBannerService.getAdBannerById(req.params.id);
    if (!banner) return errorResponse(res, 404, 'Ad Banner not found');
    return successResponse(res, 200, 'Ad Banner fetched successfully', banner);
  } catch (error) {
    next(error);
  }
};

export const updateAdBanner = async (req, res, next) => {
  try {
    const banner = await adBannerService.updateAdBanner(req.params.id, req.body);
    if (!banner) return errorResponse(res, 404, 'Ad Banner not found');
    return successResponse(res, 200, 'Ad Banner updated successfully', banner);
  } catch (error) {
    next(error);
  }
};

export const deleteAdBanner = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const banner = await adBannerService.deleteAdBanner(req.params.id, deletedRemarks, updated_by);
    if (!banner) return errorResponse(res, 404, 'Ad Banner not found');
    return successResponse(res, 200, 'Ad Banner deleted successfully', null);
  } catch (error) {
    next(error);
  }
};
