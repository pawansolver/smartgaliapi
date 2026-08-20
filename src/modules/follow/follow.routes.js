/**
 * Follow Routes — Phase 8
 * ─────────────────────────────────────────────────────────────────────────────
 * All routes require JWT authentication.
 * Rate-limited via existing distributed Redis rate limiter.
 *
 * Mounted at /api/v1/users by routes/index.js
 *
 * PRD-required endpoints:
 *   POST   /follow              — follow a user
 *   GET    /followers           — my followers
 *   GET    /following           — users I follow
 *   DELETE /unfollow/:id        — unfollow a user
 */

import express from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { followLimiter } from '../../middleware/rateLimit.middleware.js';
import {
  follow,
  followers,
  following,
  unfollow,
} from './follow.controller.js';

const router = express.Router();

// All follow routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/users/follow:
 *   post:
 *     summary: Follow a user
 *     tags: [Follow]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: The ID of the user to follow
 *                 example: 42
 *     responses:
 *       201:
 *         description: Followed successfully
 *       400:
 *         description: Invalid input or self-follow attempt
 *       404:
 *         description: Target user not found
 *       409:
 *         description: Already following this user
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/follow', followLimiter, follow);

/**
 * @swagger
 * /api/v1/users/followers:
 *   get:
 *     summary: Get my followers
 *     tags: [Follow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Paginated list of followers
 */
router.get('/followers', followers);

/**
 * @swagger
 * /api/v1/users/following:
 *   get:
 *     summary: Get users I follow
 *     tags: [Follow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Paginated list of users being followed
 */
router.get('/following', following);

/**
 * @swagger
 * /api/v1/users/unfollow/{id}:
 *   delete:
 *     summary: Unfollow a user
 *     tags: [Follow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the user to unfollow
 *     responses:
 *       200:
 *         description: Unfollowed successfully (idempotent)
 *       400:
 *         description: Invalid user id
 *       429:
 *         description: Rate limit exceeded
 */
router.delete('/unfollow/:id', followLimiter, unfollow);

export default router;
