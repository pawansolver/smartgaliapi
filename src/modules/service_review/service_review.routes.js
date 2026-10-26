import express from 'express';
import * as serviceReviewController from './service_review.controller.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import { createReviewSchema } from './service_review.validation.js';
import { uploadImage } from '../../utils/fileUpload.js';

const router = express.Router();

const reviewUpload = uploadImage('reviews').fields([
  { name: 'photo', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'image', maxCount: 1 },
]);

const extractReviewPhoto = (req, res, next) => {
  reviewUpload(req, res, (err) => {
    if (err) return next(err);
    if (!req.file && req.files) {
      req.file = req.files['photo']?.[0] || req.files['file']?.[0] || req.files['image']?.[0];
    }
    next();
  });
};

/**
 * @swagger
 * tags:
 *   name: ServiceReviews
 *   description: Enterprise Service Review and Rating APIs
 */

router.post('/upload-photo', authenticate, extractReviewPhoto, serviceReviewController.uploadReviewPhoto);
router.post('/', authenticate, validateBody(createReviewSchema), serviceReviewController.createReview);
router.get('/', optionalAuthenticate, serviceReviewController.getAllReviews);
router.get('/:id', optionalAuthenticate, serviceReviewController.getReviewById);
router.delete('/:id', authenticate, serviceReviewController.deleteReview);

export default router;
