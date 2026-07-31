import express from 'express';
import * as adBannerController from './ad_banner.controller.js';

const router = express.Router();

router.post('/', adBannerController.createAdBanner);
router.get('/', adBannerController.getAllAdBanners);
router.get('/:id', adBannerController.getAdBannerById);
router.put('/:id', adBannerController.updateAdBanner);
router.delete('/:id', adBannerController.deleteAdBanner);

export default router;
