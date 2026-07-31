import express from 'express';
import * as serviceProviderProfileController from './service_provider_profile.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ServiceProviderProfiles
 *   description: Service Provider Profile management APIs
 */

/**
 * @swagger
 * /api/v1/service-provider-profile:
 *   post:
 *     summary: Create a new service provider profile
 *     tags: [ServiceProviderProfiles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: integer
 *               service_category_id:
 *                 type: integer
 *               description:
 *                 type: string
 *               experience:
 *                 type: string
 *               hourly_rate:
 *                 type: number
 *               is_verified:
 *                 type: boolean
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Service provider profile created successfully
 */
router.post('/', serviceProviderProfileController.createProfile);

/**
 * @swagger
 * /api/v1/service-provider-profile:
 *   get:
 *     summary: Get all active service provider profiles
 *     tags: [ServiceProviderProfiles]
 *     responses:
 *       200:
 *         description: A list of service provider profiles
 */
router.get('/', serviceProviderProfileController.getAllProfiles);

/**
 * @swagger
 * /api/v1/service-provider-profile/status/pending-verification:
 *   get:
 *     summary: Get all pending service provider profiles
 *     tags: [ServiceProviderProfiles]
 *     responses:
 *       200:
 *         description: A list of pending service provider profiles
 *       500:
 *         description: Server error
 */
router.get('/status/pending-verification', serviceProviderProfileController.getPendingVerifications);

/**
 * @swagger
 * /api/v1/service-provider-profile/bulk-delete:
 *   post:
 *     summary: Bulk soft delete service provider profiles
 *     tags: [ServiceProviderProfiles]
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
 *         description: Service provider profiles deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', serviceProviderProfileController.bulkDeleteProfiles);

/**
 * @swagger
 * /api/v1/service-provider-profile/{id}:
 *   get:
 *     summary: Get a service provider profile by ID
 *     tags: [ServiceProviderProfiles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Service provider profile data
 *       404:
 *         description: Service provider profile not found
 */
router.get('/:id', serviceProviderProfileController.getProfileById);

/**
 * @swagger
 * /api/v1/service-provider-profile/{id}:
 *   put:
 *     summary: Update a service provider profile
 *     tags: [ServiceProviderProfiles]
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
 *               service_category_id:
 *                 type: integer
 *               description:
 *                 type: string
 *               experience:
 *                 type: string
 *               hourly_rate:
 *                 type: number
 *               is_verified:
 *                 type: boolean
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Service provider profile updated successfully
 *       404:
 *         description: Service provider profile not found
 */
router.put('/:id', serviceProviderProfileController.updateProfile);

/**
 * @swagger
 * /api/v1/service-provider-profile/{id}/verify:
 *   put:
 *     summary: Verify a service provider profile
 *     tags: [ServiceProviderProfiles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Service provider profile verified successfully
 *       404:
 *         description: Service provider profile not found
 */
router.put('/:id/verify', serviceProviderProfileController.verifyProfile);

/**
 * @swagger
 * /api/v1/service-provider-profile/{id}:
 *   delete:
 *     summary: Soft delete a service provider profile
 *     tags: [ServiceProviderProfiles]
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
 *         description: Service provider profile deleted successfully (soft delete)
 *       404:
 *         description: Service provider profile not found
 */
router.delete('/:id', serviceProviderProfileController.deleteProfile);

export default router;
