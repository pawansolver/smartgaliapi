/**
 * PostLike Service - Scalability Hardening Phase 10
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * LIKE / UNLIKE are fully transactional:
 *
 *   LIKE:   BEGIN -> verify post -> create PostLike -> increment likes_count
 *                 -> create POST_LIKED outbox event -> COMMIT
 *
 *   UNLIKE: BEGIN -> destroy PostLike (if exists) -> decrement likes_count (>0 guard)
 *                 -> create POST_UNLIKED outbox event -> COMMIT
 *
 * Guarantees:
 *   - No outbox event written unless DB transaction commits.
 *   - likes_count can never go negative.
 *   - Duplicate like rejected by UniqueConstraintError (409).
 *   - Duplicate unlike is idempotent.
 */

import { UniqueConstraintError, Op } from 'sequelize';
import sequelize from '../../config/db.js';
import PostLike from './post_like.model.js';
import Post from '../post/post.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import {
  emitNotification,
  resolveDisplayName,
} from '../notification/notification.service.js';
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
  emitNotification: (opts) => emitNotification(opts),
  resolveDisplayName: (id) => resolveDisplayName(id),
  createNotification: async () => null,
  sendToUser: async () => ({ sent: 1 }),
};

/**
 * Like a post - fully transactional.
 * PostLike row + likes_count increment + outbox event in ONE transaction.
 * Returns 409 if already liked.
 */
export const likePost = async (userId, postId, correlationId) => {
  let like;
  let newLikesCount = 0;
  const transaction = await sequelize.transaction();
  try {
    // 1. Verify post exists and lock the row
    const post = await Post.findOne({
      where: { id: postId, is_deleted: false },
      attributes: ['id', 'user_id', 'likes_count'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!post) {
      await transaction.rollback();
      postLikesFailedTotal.inc({ reason: 'post_not_found' });
      throw new LikeError('Post not found.', 404);
    }

    // 2. Create like row
    try {
      like = await PostLike.create({
        post_id: postId,
        user_id: userId,
        is_active: true,
      }, { transaction });
    } catch (err) {
      await transaction.rollback();
      if (err instanceof UniqueConstraintError) {
        postLikesFailedTotal.inc({ reason: 'duplicate' });
        throw new LikeError('You have already liked this post.', 409);
      }
      postLikesFailedTotal.inc({ reason: 'db_error' });
      throw err;
    }

    // 3. Atomically increment likes_count
    await Post.increment('likes_count', {
      by: 1,
      where: { id: postId },
      transaction,
    });

    // 4. Write POST_LIKED outbox event (same transaction)
    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.POST_LIKED,
      aggregate_type: OUTBOX_AGGREGATE_TYPES.POST,
      aggregate_id: String(like.id),
      payload: { postId: Number(postId), userId: Number(userId), correlationId },
    }, { transaction });

    await transaction.commit();

    // Fresh count after commit
    const fresh = await Post.findOne({ where: { id: postId }, attributes: ['likes_count'] });
    newLikesCount = Number(fresh?.likes_count ?? 0);

    postLikesTotal.inc();
    logger.info('POST_LIKE', 'post_liked', { correlationId, postId: Number(postId), newLikesCount });

    // Non-blocking notification (never inside transaction)
    const postAuthorId = Number(post.user_id);
    if (postAuthorId !== Number(userId)) {
      likeDeps.resolveDisplayName(userId)
        .then((name) => likeDeps.emitNotification({
          recipientId: postAuthorId,
          actorId: userId,
          type: 'info',
          title: 'New Like',
          message: `${name} liked your post.`,
          data: { target: 'post', postId: Number(postId), event: 'POST_LIKE' },
          preferenceKey: null,
          sendPush: true,
        }))
        .catch((e) => logger.error('POST_LIKE', 'notification_failed', { correlationId, error: e.message }));
    }
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw err;
  }
  return { likeId: Number(like.id), postId: Number(postId), newLikesCount };
};

/**
 * Unlike a post - fully transactional. Idempotent.
 * Never decrements likes_count below 0.
 */
export const unlikePost = async (userId, postId, correlationId) => {
  let deleted = 0;
  let newLikesCount = 0;
  const transaction = await sequelize.transaction();
  try {
    // 1. Destroy the like row
    deleted = await PostLike.destroy({
      where: { post_id: postId, user_id: userId },
      transaction,
    });

    if (deleted > 0) {
      // 2. Decrement likes_count - never below 0
      await Post.decrement('likes_count', {
        by: 1,
        where: { id: postId, likes_count: { [Op.gt]: 0 } },
        transaction,
      });

      // 3. Write POST_UNLIKED outbox event (same transaction)
      await createEvent({
        event_type: OUTBOX_EVENT_TYPES.POST_UNLIKED,
        aggregate_type: OUTBOX_AGGREGATE_TYPES.POST,
        aggregate_id: String(postId),
        payload: { postId: Number(postId), userId: Number(userId), correlationId },
      }, { transaction });
    }

    await transaction.commit();

    const fresh = await Post.findOne({ where: { id: postId }, attributes: ['likes_count'] });
    newLikesCount = Number(fresh?.likes_count ?? 0);

    if (deleted > 0) {
      logger.info('POST_LIKE', 'post_unliked', { correlationId, postId: Number(postId), newLikesCount });
    }
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw err;
  }
  return { unliked: deleted > 0, newLikesCount };
};

/**
 * Raw like count from DB (used by insights).
 */
export const getLikeCount = async (postId) => {
  return PostLike.count({ where: { post_id: postId } });
};

export default { likePost, unlikePost, getLikeCount };
