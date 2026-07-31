import express from 'express';
import * as serviceListingController from './service_listing.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ServiceListings
 *   description: Service Listing management APIs
 */

/**
 * @swagger
 * /api/v1/service-listing:
 *   post:
 *     summary: Create a new service listing
 *     tags: [ServiceListings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               provider_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               duration:
 *                 type: string
 *               is_available:
 *                 type: boolean
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Service listing created successfully
 */
router.post('/', serviceListingController.createListing);

/**
 * @swagger
 * /api/v1/service-listing:
 *   get:
 *     summary: Get all active service listings
 *     tags: [ServiceListings]
 *     responses:
 *       200:
 *         description: A list of service listings
 */
router.get('/', serviceListingController.getAllListings);

/**
 * @swagger
 * /api/v1/service-listing/bulk-delete:
 *   post:
 *     summary: Bulk soft delete service listings
 *     tags: [ServiceListings]
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
 *         description: Service listings deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', serviceListingController.bulkDeleteListings);

/**
 * @swagger
 * /api/v1/service-listing/{id}:
 *   get:
 *     summary: Get a service listing by ID
 *     tags: [ServiceListings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Service listing data
 *       404:
 *         description: Service listing not found
 */
router.get('/:id', serviceListingController.getListingById);

/**
 * @swagger
 * /api/v1/service-listing/{id}:
 *   put:
 *     summary: Update a service listing
 *     tags: [ServiceListings]
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
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               duration:
 *                 type: string
 *               is_available:
 *                 type: boolean
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Service listing updated successfully
 *       404:
 *         description: Service listing not found
 */
router.put('/:id', serviceListingController.updateListing);

/**
 * @swagger
 * /api/v1/service-listing/{id}:
 *   delete:
 *     summary: Soft delete a service listing
 *     tags: [ServiceListings]
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
 *         description: Service listing deleted successfully (soft delete)
 *       404:
 *         description: Service listing not found
 */
router.delete('/:id', serviceListingController.deleteListing);

export default router;
