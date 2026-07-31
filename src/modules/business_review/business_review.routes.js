import express from 'express';
import * as businessReviewController from './business_review.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: BusinessReviews
 *   description: Business Reviews management APIs
 */

/**
 * @swagger
 * /api/v1/business-review:
 *   post:
 *     summary: Add a new business review
 *     tags: [BusinessReviews]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - business_id
 *               - user_id
 *               - rating
 *             properties:
 *               business_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               rating:
 *                 type: integer
 *                 description: Rating from 1 to 5
 *               comment:
 *                 type: string
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Business review added successfully
 */
router.post('/', businessReviewController.createReview);

/**
 * @swagger
 * /api/v1/business-review:
 *   get:
 *     summary: Get all active business reviews
 *     tags: [BusinessReviews]
 *     responses:
 *       200:
 *         description: A list of business reviews
 */
router.get('/', businessReviewController.getAllReviews);

/**
 * @swagger
 * /api/v1/business-review/{id}:
 *   get:
 *     summary: Get a business review by ID
 *     tags: [BusinessReviews]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Business review data
 *       404:
 *         description: Business review not found
 */
router.get('/:id', businessReviewController.getReviewById);

/**
 * @swagger
 * /api/v1/business-review/{id}:
 *   put:
 *     summary: Update a business review
 *     tags: [BusinessReviews]
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
 *         description: Business review updated successfully
 *       404:
 *         description: Business review not found
 */
router.put('/:id', businessReviewController.updateReview);

/**
 * @swagger
 * /api/v1/business-review/{id}:
 *   delete:
 *     summary: Soft delete a business review
 *     tags: [BusinessReviews]
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
 *         description: Business review deleted successfully (soft delete)
 *       404:
 *         description: Business review not found
 */
router.delete('/:id', businessReviewController.deleteReview);

export default router;
