import express from 'express';
import * as businessImageController from './business_image.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: BusinessImages
 *   description: Business Images management APIs
 */

/**
 * @swagger
 * /api/v1/business-image:
 *   post:
 *     summary: Add a new business image
 *     tags: [BusinessImages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - business_id
 *               - image_url
 *             properties:
 *               business_id:
 *                 type: integer
 *               image_url:
 *                 type: string
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Business image added successfully
 */
router.post('/', businessImageController.createImage);

/**
 * @swagger
 * /api/v1/business-image:
 *   get:
 *     summary: Get all active business images
 *     tags: [BusinessImages]
 *     responses:
 *       200:
 *         description: A list of business images
 */
router.get('/', businessImageController.getAllImages);

/**
 * @swagger
 * /api/v1/business-image/{id}:
 *   get:
 *     summary: Get a business image by ID
 *     tags: [BusinessImages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Business image data
 *       404:
 *         description: Business image not found
 */
router.get('/:id', businessImageController.getImageById);

/**
 * @swagger
 * /api/v1/business-image/{id}:
 *   put:
 *     summary: Update a business image
 *     tags: [BusinessImages]
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
 *               business_id:
 *                 type: integer
 *               image_url:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Business image updated successfully
 *       404:
 *         description: Business image not found
 */
router.put('/:id', businessImageController.updateImage);

/**
 * @swagger
 * /api/v1/business-image/{id}:
 *   delete:
 *     summary: Soft delete a business image
 *     tags: [BusinessImages]
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
 *         description: Business image deleted successfully (soft delete)
 *       404:
 *         description: Business image not found
 */
router.delete('/:id', businessImageController.deleteImage);

export default router;
