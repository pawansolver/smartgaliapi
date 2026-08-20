/**
 * Post Service � Phase 9
 * -----------------------------------------------------------------------------
 * Enterprise-grade post creation with:
 *   - JWT-only author identification (never trusts body userId)
 *   - MediaFile ownership validation
 *   - Soft-delete support
 *   - Prometheus metrics
 *   - Structured logging
 */

import Post from './post.model.js';
import MediaFile from '../media_file/media_file.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import User from '../user/user.model.js';
import { logger } from '../../utils/logger.js';
import {
  postsCreatedTotal,
  postsCreationFailedTotal,
} from '../../monitoring/metrics.js';

// -- Safe attributes -----------------------------------------------------------
const SAFE_USER_ATTRS = ['userId', 'userName'];
const SAFE_PROFILE_ATTRS = ['fullName', 'avatarUrl'];

export class PostError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'PostError';
    this.statusCode = statusCode;
  }
}

// Allowed content types (from existing Post model enum)
const ALLOWED_TYPES = new Set(['text', 'image', 'video', 'poll', 'event', 'mixed']);
const ALLOWED_VISIBILITY = new Set(['public', 'private', 'friends', 'community', 'followers']);
const MAX_CONTENT_LENGTH = 5000;
const MAX_MEDIA_PER_POST = 5;

/**
 * Create a new post.
 * @param {number} authorId - From req.user.id (JWT), never from body
 * @param {object} data - { content, type, visibility, mediaIds, communityId }
 * @param {string} correlationId
 */
export const createPost = async (authorId, data, correlationId) => {
  const {
    content,
    type = 'text',
    visibility = 'public',
    mediaIds = [],
    communityId = null,
  } = data;

  // Validate content
  if (!content && (!mediaIds || mediaIds.length === 0)) {
    postsCreationFailedTotal.inc({ reason: 'empty_post' });
    throw new PostError('Post must have content or media.', 400);
  }
  if (content && content.length > MAX_CONTENT_LENGTH) {
    postsCreationFailedTotal.inc({ reason: 'content_too_long' });
    throw new PostError(`Post content cannot exceed ${MAX_CONTENT_LENGTH} characters.`, 400);
  }
  if (!ALLOWED_TYPES.has(type)) {
    postsCreationFailedTotal.inc({ reason: 'invalid_type' });
    throw new PostError(`Invalid post type. Allowed: ${[...ALLOWED_TYPES].join(', ')}`, 400);
  }
  if (!ALLOWED_VISIBILITY.has(visibility)) {
    postsCreationFailedTotal.inc({ reason: 'invalid_visibility' });
    throw new PostError(`Invalid visibility. Allowed: ${[...ALLOWED_VISIBILITY].join(', ')}`, 400);
  }
  if (mediaIds.length > MAX_MEDIA_PER_POST) {
    postsCreationFailedTotal.inc({ reason: 'too_many_media' });
    throw new PostError(`Cannot attach more than ${MAX_MEDIA_PER_POST} media files per post.`, 400);
  }

  // Validate media ownership � prevent User A attaching User B's media
  if (mediaIds.length > 0) {
    const files = await MediaFile.findAll({
      where: { id: mediaIds, is_deleted: false },
      attributes: ['id', 'uploaded_by', 'url', 'type'],
    });
    if (files.length !== mediaIds.length) {
      postsCreationFailedTotal.inc({ reason: 'media_not_found' });
      throw new PostError('One or more media files not found.', 400);
    }
    const notOwned = files.some((f) => String(f.uploaded_by) !== String(authorId));
    if (notOwned) {
      postsCreationFailedTotal.inc({ reason: 'media_not_owned' });
      throw new PostError('You do not own all specified media files.', 403);
    }
  }

  // Determine effective type
  let effectiveType = type;
  if (mediaIds.length > 0 && type === 'text') {
    effectiveType = 'image'; // default to image if media provided without explicit type
  }

  // Fetch the actual media file rows (with URL) for linking
  let linkedMediaFiles = [];
  if (mediaIds.length > 0) {
    linkedMediaFiles = await MediaFile.findAll({
      where: { id: mediaIds, is_deleted: false },
      attributes: ['id', 'url', 'type'],
      order: [['id', 'ASC']],
    });
  }

  // Build media_url from the first media file (posts table has single media_url column)
  const primaryMediaUrl = linkedMediaFiles.length > 0 ? linkedMediaFiles[0].url : null;

  const post = await Post.create({
    user_id: authorId,
    content: content || null,
    type: effectiveType,
    visibility,
    media_url: primaryMediaUrl,
    is_active: true,
    is_deleted: false,
    created_at: new Date(), // explicit since timestamps: false in Post model
  });

  postsCreatedTotal.inc({ post_type: effectiveType });
  logger.info('POST', 'post_created', { correlationId, postId: Number(post.id) });

  return serializePost(post, null, linkedMediaFiles);
};

/**
 * Load a single post with author + media, safe serialization.
 */
export const getPostById = async (postId) => {
  const post = await Post.findOne({
    where: { id: postId, is_deleted: false },
    include: [
      {
        model: User,
        as: 'author',
        attributes: SAFE_USER_ATTRS,
        include: [{ model: UserProfile, as: 'profile', attributes: SAFE_PROFILE_ATTRS, required: false }],
      },
    ],
  });
  if (!post) return null;
  return serializePost(post, post.author, []);
};

/**
 * Serialize a post row into a safe API response.
 * Never returns email, password, phone, or tokens.
 */
export const serializePost = (post, author, media = []) => ({
  id: Number(post.id),
  content: post.content || null,
  postType: post.type || 'text',
  // Primary media URL (first image/video)
  mediaUrl: post.media_url || (media.length > 0 ? media[0].url : null),
  // All media files for multi-image posts
  mediaUrls: media.map((m) => ({ id: Number(m.id), url: m.url, type: m.type })),
  likeCount: Number(post.likes_count ?? 0),
  commentCount: Number(post.comments_count ?? 0),
  // Always serialize as ISO 8601 — MySQL returns Date object or null string
  createdAt: post.created_at instanceof Date
    ? post.created_at.toISOString()
    : (post.created_at && post.created_at !== 'null')
      ? new Date(post.created_at).toISOString()
      : null,
  author: author ? {
    userId: Number(author.userId),
    userName: author.userName || null,
    fullName: author.profile?.fullName || author.userName || null,
    avatarUrl: author.profile?.avatarUrl || null,
  } : null,
});

export default { createPost, getPostById, serializePost };
