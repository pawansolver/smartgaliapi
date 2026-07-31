import express from 'express';
import * as societyProfileController from './society_profile.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SocietyProfiles
 *   description: Society Profile management APIs
 */

/**
 * @swagger
 * /api/v1/society-profile:
 *   post:
 *     summary: Create a new society profile
 *     tags: [SocietyProfiles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - society_name
 *             properties:
 *               user_id:
 *                 type: integer
 *               society_name:
 *                 type: string
 *               registration_no:
 *                 type: string
 *               address:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               total_flats:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Society profile created successfully
 */
router.post('/', societyProfileController.createProfile);

/**
 * @swagger
 * /api/v1/society-profile:
 *   get:
 *     summary: Get all active society profiles
 *     tags: [SocietyProfiles]
 *     responses:
 *       200:
 *         description: A list of society profiles
 */
router.get('/', societyProfileController.getAllProfiles);

/**
 * @swagger
 * /api/v1/society-profile/bulk-delete:
 *   post:
 *     summary: Bulk soft delete society profiles
 *     tags: [SocietyProfiles]
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
 *         description: Society profiles deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', societyProfileController.bulkDeleteProfiles);

/**
 * @swagger
 * /api/v1/society-profile/{id}:
 *   get:
 *     summary: Get a society profile by ID
 *     tags: [SocietyProfiles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Society profile data
 *       404:
 *         description: Society profile not found
 */
router.get('/:id', societyProfileController.getProfileById);

/**
 * @swagger
 * /api/v1/society-profile/{id}:
 *   put:
 *     summary: Update a society profile
 *     tags: [SocietyProfiles]
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
 *               society_name:
 *                 type: string
 *               registration_no:
 *                 type: string
 *               address:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               total_flats:
 *                 type: integer
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Society profile updated successfully
 *       404:
 *         description: Society profile not found
 */
router.put('/:id', societyProfileController.updateProfile);

/**
 * @swagger
 * /api/v1/society-profile/{id}:
 *   delete:
 *     summary: Soft delete a society profile
 *     tags: [SocietyProfiles]
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
 *         description: Society profile deleted successfully (soft delete)
 *       404:
 *         description: Society profile not found
 */
router.delete('/:id', societyProfileController.deleteProfile);

export default router;
