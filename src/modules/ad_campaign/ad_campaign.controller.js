import { successResponse, errorResponse } from '../../utils/response.js';
import * as adCampaignService from './ad_campaign.service.js';

export const createAdCampaign = async (req, res, next) => {
  try {
    const campaign = await adCampaignService.createAdCampaign(req.body);
    return successResponse(res, 201, 'Ad Campaign created successfully', campaign);
  } catch (error) {
    next(error);
  }
};

export const getAllAdCampaigns = async (req, res, next) => {
  try {
    const campaigns = await adCampaignService.getAllAdCampaigns();
    return successResponse(res, 200, 'Ad Campaigns fetched successfully', campaigns);
  } catch (error) {
    next(error);
  }
};

export const getAdCampaignById = async (req, res, next) => {
  try {
    const campaign = await adCampaignService.getAdCampaignById(req.params.id);
    if (!campaign) return errorResponse(res, 404, 'Ad Campaign not found');
    return successResponse(res, 200, 'Ad Campaign fetched successfully', campaign);
  } catch (error) {
    next(error);
  }
};

export const updateAdCampaign = async (req, res, next) => {
  try {
    const campaign = await adCampaignService.updateAdCampaign(req.params.id, req.body);
    if (!campaign) return errorResponse(res, 404, 'Ad Campaign not found');
    return successResponse(res, 200, 'Ad Campaign updated successfully', campaign);
  } catch (error) {
    next(error);
  }
};

export const deleteAdCampaign = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const campaign = await adCampaignService.deleteAdCampaign(req.params.id, deletedRemarks, updated_by);
    if (!campaign) return errorResponse(res, 404, 'Ad Campaign not found');
    return successResponse(res, 200, 'Ad Campaign deleted successfully', null);
  } catch (error) {
    next(error);
  }
};
