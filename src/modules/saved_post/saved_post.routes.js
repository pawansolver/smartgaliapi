import express from 'express';
import * as savedPostController from './saved_post.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: SavedPosts
 *   description: Saved Post management APIs
 */

/**
 * @swagger
 * /api/v1/saved-post:
 *   post:
 *     summary: Create a new saved post
 *     tags: [SavedPosts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: integer
 *               post_id:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Saved post created successfully
 */
router.post('/', savedPostController.createSavedPost);

/**
 * @swagger
 * /api/v1/saved-post:
 *   get:
 *     summary: Get all active saved posts
 *     tags: [SavedPosts]
 *     responses:
 *       200:
 *         description: A list of saved posts
 */
router.get('/', savedPostController.getAllSavedPosts);

/**
 * @swagger
 * /api/v1/saved-post/bulk-delete:
 *   post:
 *     summary: Bulk soft delete saved posts
 *     tags: [SavedPosts]
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
 *         description: Saved posts deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', savedPostController.bulkDeleteSavedPosts);

/**
 * @swagger
 * /api/v1/saved-post/{id}:
 *   get:
 *     summary: Get a saved post by ID
 *     tags: [SavedPosts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Saved post data
 *       404:
 *         description: Saved post not found
 */
router.get('/:id', savedPostController.getSavedPostById);

/**
 * @swagger
 * /api/v1/saved-post/{id}:
 *   put:
 *     summary: Update a saved post
 *     tags: [SavedPosts]
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
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Saved post updated successfully
 *       404:
 *         description: Saved post not found
 */
router.put('/:id', savedPostController.updateSavedPost);

/**
 * @swagger
 * /api/v1/saved-post/{id}:
 *   delete:
 *     summary: Soft delete a saved post
 *     tags: [SavedPosts]
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
 *         description: Saved post deleted successfully (soft delete)
 *       404:
 *         description: Saved post not found
 */
router.delete('/:id', savedPostController.deleteSavedPost);

export default router;
