import express from 'express';
import * as businessOfferController from './business_offer.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: BusinessOffers
 *   description: Enterprise Bulk Offer Campaigns, Discount Groups & Scopes APIs
 */

router.post('/', businessOfferController.createOffer);
router.post('/preview', businessOfferController.previewOfferCampaign);
router.get('/', businessOfferController.getAllOffers);
router.get('/business/:businessId/eligible-catalog', businessOfferController.getEligibleCatalogForOffers);
router.get('/business/:businessId', businessOfferController.getOffersByBusiness);
router.get('/:id', businessOfferController.getOfferById);
router.put('/:id', businessOfferController.updateOffer);
router.patch('/:id/toggle', businessOfferController.toggleOfferStatus);
router.delete('/:id', businessOfferController.deleteOffer);

export default router;
