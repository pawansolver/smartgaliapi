import express from 'express';
import * as serviceReviewController from './service_review.controller.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import { createReviewSchema } from './service_review.validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ServiceReviews
 *   description: Enterprise Service Review and Rating APIs
 */

router.post('/', authenticate, validateBody(createReviewSchema), serviceReviewController.createReview);
router.get('/', optionalAuthenticate, serviceReviewController.getAllReviews);
router.get('/:id', optionalAuthenticate, serviceReviewController.getReviewById);
router.delete('/:id', authenticate, serviceReviewController.deleteReview);

export default router;
