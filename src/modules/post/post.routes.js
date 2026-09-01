/**
 * Post Routes - Phase 10 (Scalability Hardening)
 */
import express from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  postCreateLimiter,
  postLikeLimiter,
  postCommentLimiter,
  mediaUploadLimiter,
  postShareLimiter,
  postReportLimiter,
  batchViewsLimiter,
} from '../../middleware/rateLimit.middleware.js';
import { postMediaUpload, validatePostMedia } from '../../utils/postMediaUpload.js';
import {
  create,
  getOne,
  getPostInsights,
  recordBatchViews,
  updatePost,
  updateVisibility,
  togglePin,
  toggleComments,
  like,
  unlike,
  comment,
  listComments,
  uploadMedia,
  deletePost,
  reportPost,
} from './post.controller.js';
import { requirePostReadAccess } from '../../middleware/postAccess.middleware.js';

const router = express.Router();

// All post routes require auth
router.use(authenticate);

/** POST /api/v1/post/upload */
router.post('/upload', mediaUploadLimiter, postMediaUpload.single('file'), validatePostMedia, uploadMedia);

/** POST /api/v1/post - Create new post */
router.post('/', postCreateLimiter, create);

/** GET /api/v1/post/:id/insights - Live Post Insights & Analytics */
router.get('/:id/insights', requirePostReadAccess, getPostInsights);

/** POST /api/v1/post/batch-views - Async viewport dwell-time ingestion (202 Accepted) */
router.post('/batch-views', batchViewsLimiter, recordBatchViews);

/** GET /api/v1/post/:id - Get post by ID */
router.get('/:id', requirePostReadAccess, getOne);

/** PUT /api/v1/post/:id - Edit post content */
router.put('/:id', updatePost);

/** PATCH /api/v1/post/:id/visibility - Update audience / privacy */
router.patch('/:id/visibility', updateVisibility);

/** POST /api/v1/post/:id/pin - Pin/unpin post */
router.post('/:id/pin', togglePin);

/** POST /api/v1/post/:id/toggle-comments - Turn comments on/off */
router.post('/:id/toggle-comments', toggleComments);

/** POST /api/v1/post/:id/like - Like a post */
router.post('/:id/like', postLikeLimiter, requirePostReadAccess, like);

/** DELETE /api/v1/post/:id/like - Unlike a post */
router.delete('/:id/like', postLikeLimiter, requirePostReadAccess, unlike);

/** POST /api/v1/post/:id/comment - Add comment */
router.post('/:id/comment', postCommentLimiter, requirePostReadAccess, comment);

/** GET /api/v1/post/:id/comments - List comments (cursor paginated) */
router.get('/:id/comments', requirePostReadAccess, listComments);

/** DELETE /api/v1/post/:id - Soft delete own post */
router.delete('/:id', deletePost);

/** POST /api/v1/post/:id/report - Report a post */
router.post('/:id/report', postReportLimiter, reportPost);

export default router;
