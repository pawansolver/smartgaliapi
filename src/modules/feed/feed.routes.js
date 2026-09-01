/**
 * Feed Routes — Phase 9
 * Mounted at /api/v1/feed
 */
import express from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { feedFetchLimiter } from "../../middleware/rateLimit.middleware.js";
import { homeFeed } from "./feed.controller.js";

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * /api/v1/feed/home:
 *   get:
 *     summary: Get personalized home feed (follow-based)
 *     tags: [Feed]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *         description: Base64 cursor from previous response
 *     responses:
 *       200:
 *         description: Paginated feed of posts from followed users
 */
router.get("/home", feedFetchLimiter, homeFeed);

export default router;
