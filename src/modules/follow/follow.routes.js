import express from 'express';
import * as followController from './follow.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Follows
 *   description: Follow management APIs
 */

/**
 * @swagger
 * /api/v1/follow:
 *   post:
 *     summary: Create a new follow
 *     tags: [Follows]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               follower_id:
 *                 type: integer
 *               following_id:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Follow created successfully
 */
router.post('/', followController.createFollow);

/**
 * @swagger
 * /api/v1/follow:
 *   get:
 *     summary: Get all active follows
 *     tags: [Follows]
 *     responses:
 *       200:
 *         description: A list of follows
 */
router.get('/', followController.getAllFollows);

/**
 * @swagger
 * /api/v1/follow/bulk-delete:
 *   post:
 *     summary: Bulk soft delete follows
 *     tags: [Follows]
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
 *         description: Follows deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', followController.bulkDeleteFollows);

/**
 * @swagger
 * /api/v1/follow/{id}:
 *   get:
 *     summary: Get a follow by ID
 *     tags: [Follows]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Follow data
 *       404:
 *         description: Follow not found
 */
router.get('/:id', followController.getFollowById);

/**
 * @swagger
 * /api/v1/follow/{id}:
 *   put:
 *     summary: Update a follow
 *     tags: [Follows]
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
 *         description: Follow updated successfully
 *       404:
 *         description: Follow not found
 */
router.put('/:id', followController.updateFollow);

/**
 * @swagger
 * /api/v1/follow/{id}:
 *   delete:
 *     summary: Soft delete a follow
 *     tags: [Follows]
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
 *         description: Follow deleted successfully (soft delete)
 *       404:
 *         description: Follow not found
 */
router.delete('/:id', followController.deleteFollow);

export default router;
