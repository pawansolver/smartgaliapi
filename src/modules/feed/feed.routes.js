import express from 'express';
import * as feedController from './feed.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Feed
 *     description: Hyperlocal Neighborhood Feed & Notice Board
 */

/**
 * @swagger
 * /api/v1/feed:
 *   get:
 *     summary: Get hyperlocal home feed (notices + timeline posts within 5km)
 *     tags: [Feed]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Feed with notices and timeline
 *       422:
 *         description: User location not set
 */
router.get('/', authenticate, feedController.getHomeFeed);

/**
 * @swagger
 * /api/v1/feed/post:
 *   post:
 *     summary: Create a new post in the hyperlocal feed
 *     tags: [Feed]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *               mediaUrl:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Post created successfully
 */
router.post('/post', authenticate, feedController.createPost);

/**
 * @swagger
 * /api/v1/feed/post/{id}/like:
 *   post:
 *     summary: Toggle like on a post (like/unlike)
 *     tags: [Feed]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Like toggled
 *       404:
 *         description: Post not found
 */
router.post('/post/:id/like', authenticate, feedController.toggleLikePost);

export default router;
