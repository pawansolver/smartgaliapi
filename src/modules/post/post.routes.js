/**
 * Post Routes — Phase 9
 * ─────────────────────────────────────────────────────────────────────────────
 * PRD-defined endpoints:
 *   POST   /api/v1/post              — Create post
 *   GET    /api/v1/post/:id          — Get single post
 *   POST   /api/v1/post/:id/like     — Like a post
 *   DELETE /api/v1/post/:id/like     — Unlike a post
 *   POST   /api/v1/post/:id/comment  — Comment on post
 *   GET    /api/v1/post/:id/comments — List comments
 *   POST   /api/v1/post/upload       — Upload media (image/video)
 */
import express from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  postCreateLimiter,
  postLikeLimiter,
  postCommentLimiter,
  mediaUploadLimiter,
} from '../../middleware/rateLimit.middleware.js';
import { postMediaUpload, validatePostMedia } from '../../utils/postMediaUpload.js';
import {
  create,
  getOne,
  like,
  unlike,
  comment,
  listComments,
  uploadMedia,
  deletePost,
  reportPost,
} from './post.controller.js';

const router = express.Router();

// All post routes require auth
router.use(authenticate);

/**
 * @swagger
 * /api/v1/post/upload:
 *   post:
 *     summary: Upload post media (image/video)
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Media uploaded, returns mediaId + url
 */
router.post('/upload', mediaUploadLimiter, postMediaUpload.single('file'), validatePostMedia, uploadMedia);

/**
 * @swagger
 * /api/v1/post:
 *   post:
 *     summary: Create a new post
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 5000
 *               type:
 *                 type: string
 *                 enum: [text, image, video, poll, event, mixed]
 *               visibility:
 *                 type: string
 *                 enum: [public, private, friends, community, followers]
 *               mediaIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               communityId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Post created successfully
 *       400:
 *         description: Validation error
 */
router.post('/', postCreateLimiter, create);

/**
 * @swagger
 * /api/v1/post/{id}:
 *   get:
 *     summary: Get a single post by ID
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', getOne);

/**
 * @swagger
 * /api/v1/post/{id}/like:
 *   post:
 *     summary: Like a post
 *     tags: [Posts]
 */
router.post('/:id/like', postLikeLimiter, like);

/**
 * @swagger
 * /api/v1/post/{id}/like:
 *   delete:
 *     summary: Unlike a post
 *     tags: [Posts]
 */
router.delete('/:id/like', postLikeLimiter, unlike);

/**
 * @swagger
 * /api/v1/post/{id}/comment:
 *   post:
 *     summary: Add a comment to a post
 *     tags: [Posts]
 */
router.post('/:id/comment', postCommentLimiter, comment);

/**
 * @swagger
 * /api/v1/post/{id}/comments:
 *   get:
 *     summary: List comments on a post
 *     tags: [Posts]
 */
router.get('/:id/comments', listComments);

/** DELETE /api/v1/post/:id — Soft delete own post */
router.delete('/:id', deletePost);

/** POST /api/v1/post/:id/report — Report a post */
router.post('/:id/report', reportPost);

export default router;
