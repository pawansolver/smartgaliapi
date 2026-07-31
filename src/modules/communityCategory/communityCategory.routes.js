import express from 'express';
import * as communityCategoryController from './communityCategory.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: CommunityCategories
 *   description: Community Category management APIs
 */

/**
 * @swagger
 * /api/v1/community-category:
 *   post:
 *     summary: Create a new community category
 *     tags: [CommunityCategories]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - communityCategoryName
 *             properties:
 *               communityCategoryName:
 *                 type: string
 *               communityCategoryIcon:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Community Category created successfully
 */
router.post('/', uploadImage('communityCategory').single('communityCategoryIcon'), communityCategoryController.createCommunityCategory);

/**
 * @swagger
 * /api/v1/community-category:
 *   get:
 *     summary: Get all active community categories
 *     tags: [CommunityCategories]
 *     responses:
 *       200:
 *         description: A list of community categories
 */
router.get('/', communityCategoryController.getAllCommunityCategories);

/**
 * @swagger
 * /api/v1/community-category/{id}:
 *   get:
 *     summary: Get a community category by ID
 *     tags: [CommunityCategories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Community Category data
 *       404:
 *         description: Community Category not found
 */
router.get('/:id', communityCategoryController.getCommunityCategoryById);

/**
 * @swagger
 * /api/v1/community-category/{id}:
 *   put:
 *     summary: Update a community category
 *     tags: [CommunityCategories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               communityCategoryName:
 *                 type: string
 *               communityCategoryIcon:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Community Category updated successfully
 *       404:
 *         description: Community Category not found
 */
router.put('/:id', uploadImage('communityCategory').single('communityCategoryIcon'), communityCategoryController.updateCommunityCategory);

/**
 * @swagger
 * /api/v1/community-category/{id}:
 *   delete:
 *     summary: Soft delete a community category
 *     tags: [CommunityCategories]
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
 *                 type: string
 *     responses:
 *       200:
 *         description: Community Category deleted successfully (soft delete)
 *       404:
 *         description: Community Category not found
 */
router.delete('/:id', communityCategoryController.deleteCommunityCategory);

export default router;
