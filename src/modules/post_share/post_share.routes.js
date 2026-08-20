import express from 'express';
import * as postShareController from './post_share.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: PostShares
 *   description: Post Share management APIs
 */

/**
 * @swagger
 * /api/v1/post-share:
 *   post:
 *     summary: Create a new post share
 *     tags: [PostShares]
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
 *         description: Post share created successfully
 */
router.post('/', postShareController.createShare);

/**
 * @swagger
 * /api/v1/post-share:
 *   get:
 *     summary: Get all active post shares
 *     tags: [PostShares]
 *     responses:
 *       200:
 *         description: A list of post shares
 */
router.get('/', postShareController.getAllShares);

/**
 * @swagger
 * /api/v1/post-share/bulk-delete:
 *   post:
 *     summary: Bulk soft delete post shares
 *     tags: [PostShares]
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
 *         description: Post shares deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', postShareController.bulkDeleteShares);

/**
 * @swagger
 * /api/v1/post-share/{id}:
 *   get:
 *     summary: Get a post share by ID
 *     tags: [PostShares]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Post share data
 *       404:
 *         description: Post share not found
 */
router.get('/:id', postShareController.getShareById);

/**
 * @swagger
 * /api/v1/post-share/{id}:
 *   put:
 *     summary: Update a post share
 *     tags: [PostShares]
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
 *         description: Post share updated successfully
 *       404:
 *         description: Post share not found
 */
router.put('/:id', postShareController.updateShare);

/**
 * @swagger
 * /api/v1/post-share/{id}:
 *   delete:
 *     summary: Soft delete a post share
 *     tags: [PostShares]
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
 *         description: Post share deleted successfully (soft delete)
 *       404:
 *         description: Post share not found
 */
router.delete('/:id', postShareController.deleteShare);

export default router;
