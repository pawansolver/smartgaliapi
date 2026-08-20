/**
 * PostLike Service — Phase 9
 * ─────────────────────────────────────────────────────────────────────────────
 * Like / Unlike with:
 *   - UNIQUE(post_id, user_id) enforced at DB + service layers
 *   - Non-blocking FCM notification via Outbox
 *   - Prometheus metrics
 */

import { UniqueConstraintError } from 'sequelize';
import PostLike from './post_like.model.js';
import Post from '../post/post.model.js';
import { createNotification } from '../notification/notification.service.js';
import { sendToUser } from '../../infrastructure/notifications/push.service.js';
import { logger } from '../../utils/logger.js';
import {
  postLikesTotal,
  postLikesFailedTotal,
} from '../../monitoring/metrics.js';

export class LikeError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'LikeError';
    this.statusCode = statusCode;
  }
}

/** Mutable deps for tests */
export const likeDeps = {
  createNotification: (data) => createNotification(data),
  sendToUser: (args) => sendToUser(args),
};

/**
 * Like a post. Idempotent — returns 409 if already liked.
 * @param {number} userId - from JWT only
 * @param {number} postId - from URL param
 * @param {string} correlationId
 */
export const likePost = async (userId, postId, correlationId) => {
  // 1. Post must exist
  const post = await Post.findOne({
    where: { id: postId, is_deleted: false },
    attributes: ['id', 'user_id'],
  });
  if (!post) {
    postLikesFailedTotal.inc({ reason: 'post_not_found' });
    throw new LikeError('Post not found.', 404);
  }

  // 2. Create like (UniqueConstraintError → already liked)
  let like;
  try {
    like = await PostLike.create({
      post_id: postId,
      user_id: userId,
      is_active: true,
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      postLikesFailedTotal.inc({ reason: 'duplicate' });
      throw new LikeError('You have already liked this post.', 409);
    }
    postLikesFailedTotal.inc({ reason: 'db_error' });
    throw err;
  }

  postLikesTotal.inc();
  logger.info('POST_LIKE', 'post_liked', { correlationId, postId: Number(postId) });

  // 3. Notify post author (non-blocking)
  const postAuthorId = Number(post.user_id);
  if (postAuthorId !== Number(userId)) {
    try {
      await likeDeps.createNotification({
        user_id: postAuthorId,
        title: 'New Like',
        message: 'Someone liked your post.',
        type: 'info',
        data: { type: 'POST_LIKE', postId: Number(postId) },
        created_by: userId,
        is_active: true,
        is_deleted: false,
      });
      await likeDeps.sendToUser({
        userId: postAuthorId,
        title: 'New Like',
        body: 'Someone liked your post.',
        data: { type: 'POST_LIKE', postId: String(postId) },
      });
    } catch (notifErr) {
      logger.error('POST_LIKE', 'notification_failed', {
        correlationId,
        error: notifErr.message,
      });
    }
  }

  return { likeId: Number(like.id), postId: Number(postId) };
};

/**
 * Unlike a post. Idempotent — returns success even if not liked.
 */
export const unlikePost = async (userId, postId, correlationId) => {
  const deleted = await PostLike.destroy({
    where: { post_id: postId, user_id: userId },
  });

  if (deleted > 0) {
    logger.info('POST_LIKE', 'post_unliked', { correlationId, postId: Number(postId) });
  }

  return { unliked: deleted > 0 };
};

/**
 * Get like count for a post.
 */
export const getLikeCount = async (postId) => {
  return PostLike.count({ where: { post_id: postId } });
};

export default { likePost, unlikePost, getLikeCount };
