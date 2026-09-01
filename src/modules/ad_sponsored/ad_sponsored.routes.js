import express from 'express';
import * as adSponsoredController from './ad_sponsored.controller.js';

const router = express.Router();

router.post('/', adSponsoredController.createAdSponsoredPost);
router.get('/', adSponsoredController.getAllAdSponsoredPosts);
router.get('/:id', adSponsoredController.getAdSponsoredPostById);
router.put('/:id', adSponsoredController.updateAdSponsoredPost);
router.delete('/:id', adSponsoredController.deleteAdSponsoredPost);

export default router;
