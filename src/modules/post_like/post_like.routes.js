import express from 'express';
import * as postLikeController from './post_like.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: PostLikes
 *   description: Post Like management APIs
 */

/**
 * @swagger
 * /api/v1/post-like:
 *   post:
 *     summary: Create a new post like
 *     tags: [PostLikes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               post_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Post like created successfully
 */
router.post('/', postLikeController.createLike);

/**
 * @swagger
 * /api/v1/post-like:
 *   get:
 *     summary: Get all active post likes
 *     tags: [PostLikes]
 *     responses:
 *       200:
 *         description: A list of post likes
 */
router.get('/', postLikeController.getAllLikes);

/**
 * @swagger
 * /api/v1/post-like/bulk-delete:
 *   post:
 *     summary: Bulk soft delete post likes
 *     tags: [PostLikes]
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
 *         description: Post likes deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', postLikeController.bulkDeleteLikes);

/**
 * @swagger
 * /api/v1/post-like/{id}:
 *   get:
 *     summary: Get a post like by ID
 *     tags: [PostLikes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Post like data
 *       404:
 *         description: Post like not found
 */
router.get('/:id', postLikeController.getLikeById);

/**
 * @swagger
 * /api/v1/post-like/{id}:
 *   put:
 *     summary: Update a post like
 *     tags: [PostLikes]
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
 *         description: Post like updated successfully
 *       404:
 *         description: Post like not found
 */
router.put('/:id', postLikeController.updateLike);

/**
 * @swagger
 * /api/v1/post-like/{id}:
 *   delete:
 *     summary: Soft delete a post like
 *     tags: [PostLikes]
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
 *         description: Post like deleted successfully (soft delete)
 *       404:
 *         description: Post like not found
 */
router.delete('/:id', postLikeController.deleteLike);

export default router;
