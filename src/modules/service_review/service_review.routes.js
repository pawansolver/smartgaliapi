import express from 'express';
import * as serviceReviewController from './service_review.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ServiceReviews
 *   description: Service Review management APIs
 */

/**
 * @swagger
 * /api/v1/service-review:
 *   post:
 *     summary: Create a new service review
 *     tags: [ServiceReviews]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rating
 *             properties:
 *               booking_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               rating:
 *                 type: integer
 *                 description: Rating out of 5
 *               comment:
 *                 type: string
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Service review created successfully
 */
router.post('/', serviceReviewController.createReview);

/**
 * @swagger
 * /api/v1/service-review:
 *   get:
 *     summary: Get all active service reviews
 *     tags: [ServiceReviews]
 *     responses:
 *       200:
 *         description: A list of service reviews
 */
router.get('/', serviceReviewController.getAllReviews);

/**
 * @swagger
 * /api/v1/service-review/bulk-delete:
 *   post:
 *     summary: Bulk soft delete service reviews
 *     tags: [ServiceReviews]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               deletedRemarks:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Service reviews deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', serviceReviewController.bulkDeleteReviews);

/**
 * @swagger
 * /api/v1/service-review/{id}:
 *   get:
 *     summary: Get a service review by ID
 *     tags: [ServiceReviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Service review data
 *       404:
 *         description: Service review not found
 */
router.get('/:id', serviceReviewController.getReviewById);

/**
 * @swagger
 * /api/v1/service-review/{id}:
 *   put:
 *     summary: Update a service review
 *     tags: [ServiceReviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating:
 *                 type: integer
 *               comment:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Service review updated successfully
 *       404:
 *         description: Service review not found
 */
router.put('/:id', serviceReviewController.updateReview);

/**
 * @swagger
 * /api/v1/service-review/{id}:
 *   delete:
 *     summary: Soft delete a service review
 *     tags: [ServiceReviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deletedRemarks:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Service review deleted successfully (soft delete)
 *       404:
 *         description: Service review not found
 */
router.delete('/:id', serviceReviewController.deleteReview);

export default router;
