import express from 'express';
import * as businessProfileController from './business_profile.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: BusinessProfiles
 *   description: Business Profile management APIs
 */

/**
 * @swagger
 * /api/v1/business-profile:
 *   post:
 *     summary: Create a new business profile
 *     tags: [BusinessProfiles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - business_name
 *             properties:
 *               user_id:
 *                 type: integer
 *               business_name:
 *                 type: string
 *               category_id:
 *                 type: integer
 *               description:
 *                 type: string
 *               address:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               logo:
 *                 type: string
 *               is_verified:
 *                 type: boolean
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Business profile created successfully
 */
router.post('/', uploadImage('business').single('logo'), businessProfileController.createProfile);

/**
 * @swagger
 * /api/v1/business-profile:
 *   get:
 *     summary: Get all active business profiles
 *     tags: [BusinessProfiles]
 *     responses:
 *       200:
 *         description: A list of business profiles
 */
router.get('/', businessProfileController.getAllProfiles);

/**
 * @swagger
 * /api/v1/business-profile/{id}:
 *   get:
 *     summary: Get a business profile by ID
 *     tags: [BusinessProfiles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Business profile data
 *       404:
 *         description: Business profile not found
 */
router.get('/:id', businessProfileController.getProfileById);

/**
 * @swagger
 * /api/v1/business-profile/{id}:
 *   put:
 *     summary: Update a business profile
 *     tags: [BusinessProfiles]
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
 *               business_name:
 *                 type: string
 *               category_id:
 *                 type: integer
 *               description:
 *                 type: string
 *               address:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               logo:
 *                 type: string
 *               is_verified:
 *                 type: boolean
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Business profile updated successfully
 *       404:
 *         description: Business profile not found
 */
router.put('/:id', uploadImage('business').single('logo'), businessProfileController.updateProfile);

/**
 * @swagger
 * /api/v1/business-profile/{id}:
 *   delete:
 *     summary: Soft delete a business profile
 *     tags: [BusinessProfiles]
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
 *         description: Business profile deleted successfully (soft delete)
 *       404:
 *         description: Business profile not found
 */
router.delete('/:id', businessProfileController.deleteProfile);

/**
 * @swagger
 * /api/v1/business-profile/{id}/approve:
 *   put:
 *     summary: Approve a business profile
 *     tags: [BusinessProfiles]
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
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Business profile approved successfully
 *       404:
 *         description: Business profile not found
 */
router.put('/:id/approve', businessProfileController.approveProfile);

/**
 * @swagger
 * /api/v1/business-profile/{id}/reject:
 *   put:
 *     summary: Reject a business profile
 *     tags: [BusinessProfiles]
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
 *               rejectRemarks:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Business profile rejected successfully
 *       404:
 *         description: Business profile not found
 */
router.put('/:id/reject', businessProfileController.rejectProfile);

/**
 * @swagger
 * /api/v1/business-profile/{id}/feature:
 *   put:
 *     summary: Feature a business profile
 *     tags: [BusinessProfiles]
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
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Business profile featured successfully
 *       404:
 *         description: Business profile not found
 */
router.put('/:id/feature', businessProfileController.featureProfile);

/**
 * @swagger
 * /api/v1/business-profile/{id}/unfeature:
 *   put:
 *     summary: Unfeature a business profile
 *     tags: [BusinessProfiles]
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
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Business profile unfeatured successfully
 *       404:
 *         description: Business profile not found
 */
router.put('/:id/unfeature', businessProfileController.unfeatureProfile);

export default router;

