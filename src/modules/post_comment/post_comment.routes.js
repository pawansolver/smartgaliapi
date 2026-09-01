import express from 'express';
import * as postCommentController from './post_comment.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: PostComments
 *   description: Post Comment management APIs
 */

/**
 * @swagger
 * /api/v1/post-comment:
 *   post:
 *     summary: Create a new post comment
 *     tags: [PostComments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               post_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               parent_id:
 *                 type: integer
 *               content:
 *                 type: string
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Post comment created successfully
 */
router.post('/', authenticate, postCommentController.createComment);

/**
 * @swagger
 * /api/v1/post-comment/by-post/{postId}:
 *   get:
 *     summary: Get all comments for a specific post
 *     tags: [PostComments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: postId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Comments list for the post
 */
router.get('/by-post/:postId', authenticate, postCommentController.getCommentsByPost);

/**
 * @swagger
 * /api/v1/post-comment:
 *   get:
 *     summary: Get all active post comments
 *     tags: [PostComments]
 *     responses:
 *       200:
 *         description: A list of post comments
 */
router.get('/', postCommentController.getAllComments);

/**
 * @swagger
 * /api/v1/post-comment/bulk-delete:
 *   post:
 *     summary: Bulk soft delete post comments
 *     tags: [PostComments]
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
 *         description: Post comments deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', postCommentController.bulkDeleteComments);

/**
 * @swagger
 * /api/v1/post-comment/{id}:
 *   get:
 *     summary: Get a post comment by ID
 *     tags: [PostComments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Post comment data
 *       404:
 *         description: Post comment not found
 */
router.get('/:id', postCommentController.getCommentById);

/**
 * @swagger
 * /api/v1/post-comment/{id}:
 *   put:
 *     summary: Update a post comment
 *     tags: [PostComments]
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
 *               content:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Post comment updated successfully
 *       404:
 *         description: Post comment not found
 */
router.put('/:id', postCommentController.updateComment);

/**
 * @swagger
 * /api/v1/post-comment/{id}:
 *   delete:
 *     summary: Soft delete a post comment
 *     tags: [PostComments]
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
 *         description: Post comment deleted successfully (soft delete)
 *       404:
 *         description: Post comment not found
 */
router.delete('/:id', postCommentController.deleteComment);

export default router;
