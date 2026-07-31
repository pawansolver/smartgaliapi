import express from 'express';
import * as adCampaignController from './ad_campaign.controller.js';

const router = express.Router();

router.post('/', adCampaignController.createAdCampaign);
router.get('/', adCampaignController.getAllAdCampaigns);
router.get('/:id', adCampaignController.getAdCampaignById);
router.put('/:id', adCampaignController.updateAdCampaign);
router.delete('/:id', adCampaignController.deleteAdCampaign);

export default router;
