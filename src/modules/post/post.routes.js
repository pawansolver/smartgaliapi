import express from 'express';
import * as postController from './post.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Posts
 *   description: Post management APIs
 */

/**
 * @swagger
 * /api/v1/post:
 *   post:
 *     summary: Create a new post
 *     tags: [Posts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: integer
 *               community_id:
 *                 type: integer
 *               type:
 *                 type: string
 *                 enum: [text, image, video, poll, event]
 *               content:
 *                 type: string
 *               media_url:
 *                 type: string
 *               location:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               visibility:
 *                 type: string
 *                 enum: [public, private, friends, community]
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Post created successfully
 */
router.post('/', postController.createPost);

/**
 * @swagger
 * /api/v1/post:
 *   get:
 *     summary: Get all active posts
 *     tags: [Posts]
 *     responses:
 *       200:
 *         description: A list of posts
 */
router.get('/', postController.getAllPosts);

/**
 * @swagger
 * /api/v1/post/bulk-delete:
 *   post:
 *     summary: Bulk soft delete posts
 *     tags: [Posts]
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
 *         description: Posts deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', postController.bulkDeletePosts);

/**
 * @swagger
 * /api/v1/post/{id}:
 *   get:
 *     summary: Get a post by ID
 *     tags: [Posts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Post data
 *       404:
 *         description: Post not found
 */
router.get('/:id', postController.getPostById);

/**
 * @swagger
 * /api/v1/post/{id}:
 *   put:
 *     summary: Update a post
 *     tags: [Posts]
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
 *               type:
 *                 type: string
 *               content:
 *                 type: string
 *               media_url:
 *                 type: string
 *               location:
 *                 type: string
 *               visibility:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Post updated successfully
 *       404:
 *         description: Post not found
 */
router.put('/:id', postController.updatePost);

/**
 * @swagger
 * /api/v1/post/{id}:
 *   delete:
 *     summary: Soft delete a post
 *     tags: [Posts]
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
 *         description: Post deleted successfully (soft delete)
 *       404:
 *         description: Post not found
 */
router.delete('/:id', postController.deletePost);

export default router;
