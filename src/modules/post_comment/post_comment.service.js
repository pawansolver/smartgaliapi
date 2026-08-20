/**
 * PostComment Service — Phase 9
 * ─────────────────────────────────────────────────────────────────────────────
 */

import PostComment from './post_comment.model.js';
import Post from '../post/post.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import { createNotification } from '../notification/notification.service.js';
import { sendToUser } from '../../infrastructure/notifications/push.service.js';
import { logger } from '../../utils/logger.js';
import {
  postCommentsTotal,
  postCommentsFailedTotal,
} from '../../monitoring/metrics.js';

const MAX_COMMENT_LENGTH = 2000;
const SAFE_USER_ATTRS = ['userId', 'userName'];
const SAFE_PROFILE_ATTRS = ['fullName', 'avatarUrl'];

export class CommentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'CommentError';
    this.statusCode = statusCode;
  }
}

/** Mutable deps for tests */
export const commentDeps = {
  createNotification: (data) => createNotification(data),
  sendToUser: (args) => sendToUser(args),
};

/**
 * Add a comment to a post.
 * @param {number} userId - from JWT
 * @param {number} postId - from URL param
 * @param {string} content - comment text
 * @param {string} correlationId
 */
export const addComment = async (userId, postId, content, correlationId) => {
  if (!content || !content.trim()) {
    postCommentsFailedTotal.inc({ reason: 'empty_content' });
    throw new CommentError('Comment content cannot be empty.', 400);
  }
  if (content.length > MAX_COMMENT_LENGTH) {
    postCommentsFailedTotal.inc({ reason: 'content_too_long' });
    throw new CommentError(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters.`, 400);
  }

  // Post must exist
  const post = await Post.findOne({
    where: { id: postId, is_deleted: false },
    attributes: ['id', 'user_id'],
  });
  if (!post) {
    postCommentsFailedTotal.inc({ reason: 'post_not_found' });
    throw new CommentError('Post not found.', 404);
  }

  const comment = await PostComment.create({
    post_id: postId,
    user_id: userId,
    content: content.trim(),
    is_active: true,
    is_deleted: false,
    created_by: userId,
  });

  postCommentsTotal.inc();
  logger.info('POST_COMMENT', 'comment_added', {
    correlationId,
    postId: Number(postId),
    commentId: Number(comment.id),
  });

  // Notify post author (non-blocking)
  const postAuthorId = Number(post.user_id);
  if (postAuthorId !== Number(userId)) {
    try {
      await commentDeps.createNotification({
        user_id: postAuthorId,
        title: 'New Comment',
        message: 'Someone commented on your post.',
        type: 'info',
        data: { type: 'POST_COMMENT', postId: Number(postId), commentId: Number(comment.id) },
        created_by: userId,
        is_active: true,
        is_deleted: false,
      });
      await commentDeps.sendToUser({
        userId: postAuthorId,
        title: 'New Comment',
        body: 'Someone commented on your post.',
        data: { type: 'POST_COMMENT', postId: String(postId) },
      });
    } catch (notifErr) {
      logger.error('POST_COMMENT', 'notification_failed', {
        correlationId,
        error: notifErr.message,
      });
    }
  }

  // Return comment with author info so Flutter can render immediately
  return {
    id: Number(comment.id),
    postId: Number(postId),
    content: comment.content,
    createdAt: comment.created_at,
    author: {
      userId: Number(userId),
      userName: null,
      fullName: null,
      avatarUrl: null,
    },
  };
};

/**
 * Get comments for a post (paginated).
 */
export const getComments = async (postId, { page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const { count, rows } = await PostComment.findAndCountAll({
    where: { post_id: postId, is_deleted: false, parent_id: null },
    include: [{
      model: User,
      as: 'user',
      attributes: SAFE_USER_ATTRS,
      include: [{
        model: UserProfile,
        as: 'profile',
        attributes: SAFE_PROFILE_ATTRS,
        required: false,
      }],
    }],
    order: [['created_at', 'ASC']],
    limit: safeLimit,
    offset,
  });

  return {
    total: count,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(count / safeLimit),
    comments: rows.map((c) => ({
      id: Number(c.id),
      content: c.content,
      createdAt: c.created_at,
      author: {
        userId: Number(c.user.userId),
        userName: c.user.userName || null,
        fullName: c.user.profile?.fullName || null,
        avatarUrl: c.user.profile?.avatarUrl || null,
      },
    })),
  };
};

export default { addComment, getComments };
