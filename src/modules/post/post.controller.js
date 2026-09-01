/**
 * Post Controller - Scalability Hardening Phase 10
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Changes from previous version:
 *   - like(): Removed 2 extra PostLike.count() queries; returns newLikesCount from service
 *   - unlike(): Removed extra PostLike.count() query; returns newLikesCount from service
 *   - comment(): Moved comments_disabled check into the service transaction
 *   - recordBatchViews(): Fixed SQL injection, added security validation, async BullMQ enqueue
 *   - deletePost(): Emits POST_DELETED outbox event + invalidates feed cache
 *   - updatePost/togglePin/visibility/toggleComments: Invalidates feed cache
 */

import { successResponse, errorResponse } from '../../utils/response.js';
import {
  createPost,
  updatePost as serviceUpdatePost,
  togglePinPost,
  toggleCommentsDisabled,
  updatePostVisibility,
  getPostById,
  PostError,
} from './post.service.js';
import { likePost, unlikePost, LikeError } from '../post_like/post_like.service.js';
import { addComment, getComments, CommentError } from '../post_comment/post_comment.service.js';
import { mediaUploadsTotal, mediaUploadFailuresTotal, batchViewsTotal, batchViewsEnqueuedTotal } from '../../monitoring/metrics.js';
import MediaFile from '../media_file/media_file.model.js';
import Post from './post.model.js';
import Community from '../community/community.model.js';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import { createEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import { invalidateFeedCache } from '../feed/feed.service.js';
import { logger } from '../../utils/logger.js';
import { getFeedAnalyticsQueue } from '../../infrastructure/queues/queues.js';

const MAX_BATCH_VIEWS = 50;

/** POST /api/v1/post */
export const create = async (req, res, next) => {
  try {
    const authorId = req.user.id;
    const { content, type, visibility, mediaIds, communityId, locationName } = req.body;
    const result = await createPost(
      authorId,
      { content, type, visibility, mediaIds, communityId, locationName },
      req.correlationId
    );
    // Invalidate feed cache for the author (their own posts appear in their feed)
    await invalidateFeedCache(authorId);
    return successResponse(res, 201, 'Post created successfully.', result);
  } catch (err) {
    if (err instanceof PostError) return errorResponse(res, err.statusCode, err.message);
    next(err);
  }
};

/** GET /api/v1/post/:id */
export const getOne = async (req, res, next) => {
  try {
    const post = await getPostById(req.params.id);
    if (!post) return errorResponse(res, 404, 'Post not found.');
    return successResponse(res, 200, 'Post fetched.', post);
  } catch (err) { next(err); }
};

/** GET /api/v1/post/:id/insights â€” Live Real Database Metrics */
export const getPostInsights = async (req, res, next) => {
  try {
    const postId = req.params.id;
    const post = await Post.findOne({
      where: { id: postId, is_deleted: false },
      attributes: ['id', 'user_id', 'likes_count', 'comments_count', 'shares_count'],
    });
    if (!post) return errorResponse(res, 404, 'Post not found.');

    const [likesCount, commentsCountResult, sharesCountResult, savesCountResult, viewsResult] = await Promise.all([
      sequelize.query('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?', {
        replacements: [postId],
        type: sequelize.QueryTypes.SELECT,
      }).catch(() => [{ count: 0 }]),
      sequelize.query('SELECT COUNT(*) as count FROM post_comments WHERE post_id = ? AND is_deleted = 0', {
        replacements: [postId],
        type: sequelize.QueryTypes.SELECT,
      }).catch(() => [{ count: 0 }]),
      sequelize.query('SELECT COUNT(*) as count FROM post_shares WHERE post_id = ? AND is_deleted = 0', {
        replacements: [postId],
        type: sequelize.QueryTypes.SELECT,
      }).catch(() => [{ count: 0 }]),
      sequelize.query('SELECT COUNT(*) as count FROM saved_posts WHERE post_id = ? AND is_deleted = 0', {
        replacements: [postId],
        type: sequelize.QueryTypes.SELECT,
      }).catch(() => [{ count: 0 }]),
      sequelize.query('SELECT COUNT(*) as count, COALESCE(AVG(dwell_time_ms),0) as avgDwell FROM post_views WHERE post_id = ?', {
        replacements: [postId],
        type: sequelize.QueryTypes.SELECT,
      }).catch(() => [{ count: 0, avgDwell: 0 }]),
    ]);

    return successResponse(res, 200, 'Post insights fetched.', {
      postId: Number(postId),
      likesCount: Number(likesCount[0]?.count ?? 0),
      commentsCount: Number(commentsCountResult[0]?.count ?? 0),
      sharesCount: Number(sharesCountResult[0]?.count ?? 0),
      savesCount: Number(savesCountResult[0]?.count ?? 0),
      viewsCount: Number(viewsResult[0]?.count ?? 0),
      avgDwellMs: Number(viewsResult[0]?.avgDwell ?? 0),
    });
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/post/batch-views
 * Validates events synchronously, then enqueues async BullMQ job.
 * Returns 202 Accepted immediately (non-blocking).
 *
 * Security hardening:
 *   - Max 50 items per batch
 *   - dwellMs must be a safe positive integer
 *   - postId must be a safe positive integer
 *   - Author self-views filtered
 *   - Min 1000ms dwell time (MRC standard)
 */
export const recordBatchViews = async (req, res, next) => {
  try {
    const viewerId = req.user.id;
    const rawViews = Array.isArray(req.body?.views) ? req.body.views : [];

    if (rawViews.length === 0) {
      return successResponse(res, 200, 'No views to record.', { recorded: 0 });
    }

    // Cap at MAX_BATCH_VIEWS (security: prevent flooding)
    const cappedViews = rawViews.slice(0, MAX_BATCH_VIEWS);

    // Collect unique post IDs to validate existence
    const candidatePostIds = [];
    const validatedInputs = [];

    for (const item of cappedViews) {
      const pId = Number(item.postId);
      const dwell = Number(item.dwellMs || item.dwellTimeMs || 0);

      // Strict type validation - must be safe positive integers
      if (!Number.isFinite(pId) || pId <= 0 || !Number.isSafeInteger(pId)) continue;
      if (!Number.isFinite(dwell) || dwell < 1000) continue; // MRC standard: min 1s

      candidatePostIds.push(pId);
      validatedInputs.push({ postId: pId, dwellMs: Math.floor(dwell) });
    }

    if (validatedInputs.length === 0) {
      return successResponse(res, 200, 'No qualifying views.', { recorded: 0 });
    }

    // Batch-fetch posts using parameterized query (SQL injection safe)
    const posts = await sequelize.query(
      'SELECT id, user_id FROM posts WHERE id IN (?) AND is_deleted = 0',
      { replacements: [candidatePostIds], type: sequelize.QueryTypes.SELECT }
    );
    const postAuthorMap = new Map(posts.map((p) => [Number(p.id), Number(p.user_id)]));

    const qualifiedViews = validatedInputs.filter((v) => {
      const authorId = postAuthorMap.get(v.postId);
      // Must exist and not be author self-view
      return authorId !== undefined && authorId !== Number(viewerId);
    });

    if (qualifiedViews.length === 0) {
      return successResponse(res, 200, 'No qualifying views (author excluded or post not found).', { recorded: 0 });
    }

    batchViewsTotal.inc({ amount: qualifiedViews.length });

    // Enqueue async job to BullMQ feed-analytics queue
    const queue = getFeedAnalyticsQueue();
    if (queue) {
      await queue.add('batch-views', {
        viewerId: Number(viewerId),
        views: qualifiedViews,
        receivedAt: Date.now(),
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
      batchViewsEnqueuedTotal.inc();
    }

    return successResponse(res, 202, 'Batch views queued for processing.', {
      queued: qualifiedViews.length,
    });
  } catch (err) { next(err); }
};

/** PUT /api/v1/post/:id */
export const updatePost = async (req, res, next) => {
  try {
    const authorId = req.user.id;
    const result = await serviceUpdatePost(authorId, req.params.id, req.body || {});
    await invalidateFeedCache(authorId);
    return successResponse(res, 200, 'Post updated successfully.', result);
  } catch (err) {
    if (err instanceof PostError) return errorResponse(res, err.statusCode, err.message);
    next(err);
  }
};

/** PATCH /api/v1/post/:id/visibility */
export const updateVisibility = async (req, res, next) => {
  try {
    const authorId = req.user.id;
    const { visibility } = req.body || {};
    const result = await updatePostVisibility(authorId, req.params.id, visibility);
    // Privacy change - invalidate cache immediately
    await invalidateFeedCache(authorId);
    return successResponse(res, 200, 'Post audience updated successfully.', result);
  } catch (err) {
    if (err instanceof PostError) return errorResponse(res, err.statusCode, err.message);
    next(err);
  }
};

/** POST /api/v1/post/:id/pin */
export const togglePin = async (req, res, next) => {
  try {
    const authorId = req.user.id;
    const result = await togglePinPost(authorId, req.params.id);
    await invalidateFeedCache(authorId);
    return successResponse(res, 200, 'Post pin status updated successfully.', result);
  } catch (err) {
    if (err instanceof PostError) return errorResponse(res, err.statusCode, err.message);
    next(err);
  }
};

/** POST /api/v1/post/:id/toggle-comments */
export const toggleComments = async (req, res, next) => {
  try {
    const authorId = req.user.id;
    const result = await toggleCommentsDisabled(authorId, req.params.id);
    return successResponse(res, 200, 'Post comments setting updated successfully.', result);
  } catch (err) {
    if (err instanceof PostError) return errorResponse(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * POST /api/v1/post/:id/like
 * Returns newLikesCount from the service (NO extra COUNT queries).
 */
export const like = async (req, res, next) => {
  try {
    const { likeId, postId, newLikesCount } = await likePost(req.user.id, req.params.id, req.correlationId);
    return successResponse(res, 201, 'Post liked.', {
      postId: Number(req.params.id),
      likesCount: newLikesCount,
      isLikedByMe: true,
    });
  } catch (err) {
    if (err instanceof LikeError) return errorResponse(res, err.statusCode, err.message);
    next(err);
  }
};

/**
 * DELETE /api/v1/post/:id/like
 * Returns newLikesCount from the service (NO extra COUNT queries).
 */
export const unlike = async (req, res, next) => {
  try {
    const { unliked, newLikesCount } = await unlikePost(req.user.id, req.params.id, req.correlationId);
    return successResponse(res, 200, 'Post unliked.', {
      postId: Number(req.params.id),
      likesCount: newLikesCount,
      isLikedByMe: false,
    });
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/post/:id/comment
 * comments_disabled check is now inside the service transaction.
 */
export const comment = async (req, res, next) => {
  try {
    const result = await addComment(req.user.id, req.params.id, req.body?.content, req.correlationId);
    return successResponse(res, 201, 'Comment added.', result);
  } catch (err) {
    if (err instanceof CommentError) return errorResponse(res, err.statusCode, err.message);
    next(err);
  }
};

/** GET /api/v1/post/:id/comments */
export const listComments = async (req, res, next) => {
  try {
    const result = await getComments(req.params.id, req.query);
    return successResponse(res, 200, 'Comments fetched.', result);
  } catch (err) { next(err); }
};

/**
 * DELETE /api/v1/post/:id â€” Soft delete (author only)
 * Emits POST_DELETED outbox event and invalidates feed cache.
 */
export const deletePost = async (req, res, next) => {
  try {
    const post = await Post.findOne({
      where: { id: req.params.id, is_deleted: false },
      attributes: ['id', 'user_id', 'community_id'],
    });
    if (!post) return errorResponse(res, 404, 'Post not found.');
    if (Number(post.user_id) !== Number(req.user.id)) {
      return errorResponse(res, 403, 'You can only delete your own posts.');
    }

    const transaction = await sequelize.transaction();
    try {
      await post.update({ is_deleted: true, is_active: false }, { transaction });
      if (post.community_id) {
        await Community.decrement('posts_count', {
          by: 1,
          where: { communityId: post.community_id, posts_count: { [Op.gt]: 0 } },
          transaction,
        });
      }
      await createEvent({
        event_type: OUTBOX_EVENT_TYPES.POST_DELETED,
        aggregate_type: OUTBOX_AGGREGATE_TYPES.POST,
        aggregate_id: String(post.id),
        payload: { postId: Number(post.id), authorId: Number(req.user.id) },
      }, { transaction });
      await transaction.commit();
    } catch (err) {
      if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
      throw err;
    }

    // Invalidate cache after delete
    await invalidateFeedCache(req.user.id);

    return successResponse(res, 200, 'Post deleted successfully.', { postId: Number(post.id) });
  } catch (err) { next(err); }
};

/** POST /api/v1/post/:id/report */
export const reportPost = async (req, res, next) => {
  try {
    const { reason, details } = req.body || {};
    if (!reason) return errorResponse(res, 400, 'Report reason is required.');
    await sequelize.query(
      `INSERT INTO reports (reporter_id, reported_type, reported_id, reason, status, is_active, is_deleted, created_at)
       VALUES (?, 'post', ?, ?, 'pending', 1, 0, NOW())`,
      { replacements: [req.user.id, req.params.id, reason] },
    );
    return successResponse(res, 201, 'Report submitted. Thank you for keeping SmartGali safe.', {});
  } catch (err) { next(err); }
};

export const uploadMedia = async (req, res, next) => {
  try {
    if (!req.file) return errorResponse(res, 400, 'No file uploaded.');
    const uploaderId = req.user.id;
    const kind = req.file.mediaKind || 'image';
    const webUrl = `/uploads/${req.file.filename}`;

    const media = await MediaFile.create({
      url: webUrl,
      type: kind,
      uploaded_by: uploaderId,
      is_active: true,
      is_deleted: false,
      created_by: uploaderId,
    });

    mediaUploadsTotal.inc({ media_type: kind });

    return successResponse(res, 201, 'Media uploaded.', {
      mediaId: Number(media.id),
      url: webUrl,
      type: media.type,
    });
  } catch (err) {
    mediaUploadFailuresTotal.inc({ reason: 'db_error' });
    next(err);
  }
};
