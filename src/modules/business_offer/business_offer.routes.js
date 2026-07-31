import express from 'express';
import * as businessOfferController from './business_offer.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: BusinessOffers
 *   description: Business Offers management APIs
 */

/**
 * @swagger
 * /api/v1/business-offer:
 *   post:
 *     summary: Add a new business offer
 *     tags: [BusinessOffers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - business_id
 *               - title
 *             properties:
 *               business_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               discount:
 *                 type: string
 *               valid_from:
 *                 type: string
 *                 format: date
 *               valid_to:
 *                 type: string
 *                 format: date
 *               image:
 *                 type: string
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Business offer added successfully
 */
router.post('/', businessOfferController.createOffer);

/**
 * @swagger
 * /api/v1/business-offer:
 *   get:
 *     summary: Get all active business offers
 *     tags: [BusinessOffers]
 *     responses:
 *       200:
 *         description: A list of business offers
 */
router.get('/', businessOfferController.getAllOffers);

/**
 * @swagger
 * /api/v1/business-offer/{id}:
 *   get:
 *     summary: Get a business offer by ID
 *     tags: [BusinessOffers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Business offer data
 *       404:
 *         description: Business offer not found
 */
router.get('/:id', businessOfferController.getOfferById);

/**
 * @swagger
 * /api/v1/business-offer/{id}:
 *   put:
 *     summary: Update a business offer
 *     tags: [BusinessOffers]
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               discount:
 *                 type: string
 *               valid_from:
 *                 type: string
 *                 format: date
 *               valid_to:
 *                 type: string
 *                 format: date
 *               image:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Business offer updated successfully
 *       404:
 *         description: Business offer not found
 */
router.put('/:id', businessOfferController.updateOffer);

/**
 * @swagger
 * /api/v1/business-offer/{id}:
 *   delete:
 *     summary: Soft delete a business offer
 *     tags: [BusinessOffers]
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
 *         description: Business offer deleted successfully (soft delete)
 *       404:
 *         description: Business offer not found
 */
router.delete('/:id', businessOfferController.deleteOffer);

export default router;
