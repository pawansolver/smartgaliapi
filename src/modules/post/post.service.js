/**
 * Post Service - Scalability Hardening Phase 10
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * POST_CREATED is now fully transactional:
 *   BEGIN -> validate -> create Post -> create POST_CREATED outbox event -> COMMIT
 *
 * POST_DELETED also emits POST_DELETED outbox event.
 */

import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import Post from './post.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import MediaFile from '../media_file/media_file.model.js';
import Community from '../community/community.model.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import { logger } from '../../utils/logger.js';
import {
  postsCreatedTotal,
  postsCreationFailedTotal,
} from '../../monitoring/metrics.js';

export class PostError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'PostError';
    this.statusCode = statusCode;
  }
}

const ALLOWED_TYPES = new Set(['text', 'image', 'video', 'poll', 'event', 'mixed']);
const ALLOWED_VISIBILITY = new Set(['public', 'private', 'friends', 'community', 'followers']);
const MAX_CONTENT_LENGTH = 5000;
const MAX_MEDIA_PER_POST = 5;
const SAFE_USER_ATTRS = ['userId', 'userName'];
const SAFE_PROFILE_ATTRS = ['fullName', 'avatarUrl'];

/**
 * Create a new post - fully transactional.
 * Post row + POST_CREATED outbox event in ONE transaction.
 */
export const createPost = async (authorId, data, correlationId) => {
  const {
    content,
    type = 'text',
    visibility = 'public',
    mediaIds = [],
    communityId = null,
    locationName = null,
  } = data;

  let community = null;
  if (communityId != null) {
    community = await Community.findOne({
      where: { communityId, status: 'active', is_deleted: false },
    });
    if (!community) throw new PostError('Community not found.', 404);
    const membership = await CommunityMember.findOne({
      where: { community_id: communityId, user_id: authorId, status: 'active', is_deleted: false },
    });
    if (!membership) throw new PostError('Active community membership is required.', 403);
  }
  const effectiveVisibility = community ? 'community' : visibility;

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
  if (!ALLOWED_VISIBILITY.has(effectiveVisibility)) {
    postsCreationFailedTotal.inc({ reason: 'invalid_visibility' });
    throw new PostError(`Invalid visibility. Allowed: ${[...ALLOWED_VISIBILITY].join(', ')}`, 400);
  }
  if (mediaIds.length > MAX_MEDIA_PER_POST) {
    postsCreationFailedTotal.inc({ reason: 'too_many_media' });
    throw new PostError(`Cannot attach more than ${MAX_MEDIA_PER_POST} media files per post.`, 400);
  }

  let linkedMediaFiles = [];
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
    linkedMediaFiles = await MediaFile.findAll({
      where: { id: mediaIds, is_deleted: false },
      attributes: ['id', 'url', 'type'],
      order: [['id', 'ASC']],
    });
  }

  let effectiveType = type;
  if (mediaIds.length > 0 && type === 'text') {
    effectiveType = 'image';
  }

  const primaryMediaUrl = linkedMediaFiles.length > 0 ? linkedMediaFiles[0].url : null;

  let post;
  const transaction = await sequelize.transaction();
  try {
    post = await Post.create({
      user_id: authorId,
      community_id: communityId || null,
      content: content || null,
      type: effectiveType,
      visibility: effectiveVisibility,
      media_url: primaryMediaUrl,
      location_name: locationName || null,
      is_active: true,
      is_deleted: false,
      likes_count: 0,
      comments_count: 0,
      shares_count: 0,
      created_at: new Date(),
    }, { transaction });

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.POST_CREATED,
      aggregate_type: OUTBOX_AGGREGATE_TYPES.POST,
      aggregate_id: String(post.id),
      payload: {
        postId: Number(post.id),
        authorId: Number(authorId),
        visibility: effectiveVisibility,
        communityId: communityId ? Number(communityId) : null,
        correlationId,
      },
    }, { transaction });

    if (community) {
      await community.increment('posts_count', { by: 1, transaction });
    }

    await transaction.commit();
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw err;
  }

  postsCreatedTotal.inc({ post_type: effectiveType });
  logger.info('POST', 'post_created', { correlationId, postId: Number(post.id) });

  return serializePost(post, null, linkedMediaFiles, community);
};

/**
 * Edit post content & visibility (Author only)
 */
export const updatePost = async (authorId, postId, data) => {
  const { content, visibility } = data;
  if (!content || !content.trim()) {
    throw new PostError('Post content cannot be empty.', 400);
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new PostError(`Post content cannot exceed ${MAX_CONTENT_LENGTH} characters.`, 400);
  }

  const post = await Post.findOne({ where: { id: postId, is_deleted: false } });
  if (!post) throw new PostError('Post not found.', 404);
  if (Number(post.user_id) !== Number(authorId)) {
    throw new PostError('You can only edit your own posts.', 403);
  }

  const updates = { content: content.trim(), is_edited: true, edited_at: new Date() };
  if (visibility && ALLOWED_VISIBILITY.has(visibility)) {
    updates.visibility = visibility;
  }

  await post.update(updates);
  return getPostById(postId);
};

/**
 * Toggle Pin to top of profile
 */
export const togglePinPost = async (authorId, postId) => {
  const post = await Post.findOne({ where: { id: postId, is_deleted: false } });
  if (!post) throw new PostError('Post not found.', 404);
  if (Number(post.user_id) !== Number(authorId)) {
    throw new PostError('You can only pin your own posts.', 403);
  }

  const newPinState = !Boolean(post.is_pinned);
  await post.update({ is_pinned: newPinState, pinned_at: newPinState ? new Date() : null });
  return { postId: Number(postId), isPinned: newPinState };
};

/**
 * Toggle Comments On / Off
 */
export const toggleCommentsDisabled = async (authorId, postId) => {
  const post = await Post.findOne({ where: { id: postId, is_deleted: false } });
  if (!post) throw new PostError('Post not found.', 404);
  if (Number(post.user_id) !== Number(authorId)) {
    throw new PostError('You can only control comments on your own posts.', 403);
  }

  const newDisabledState = !Boolean(post.comments_disabled);
  await post.update({ comments_disabled: newDisabledState });
  return { postId: Number(postId), commentsDisabled: newDisabledState };
};

/**
 * Update Post Visibility / Audience
 */
export const updatePostVisibility = async (authorId, postId, visibility) => {
  if (!ALLOWED_VISIBILITY.has(visibility)) {
    throw new PostError(`Invalid visibility. Allowed: ${[...ALLOWED_VISIBILITY].join(', ')}`, 400);
  }
  const post = await Post.findOne({ where: { id: postId, is_deleted: false } });
  if (!post) throw new PostError('Post not found.', 404);
  if (Number(post.user_id) !== Number(authorId)) {
    throw new PostError('You can only change visibility of your own posts.', 403);
  }
  if (post.community_id != null && visibility !== 'community') {
    throw new PostError('Community posts cannot be moved outside their community.', 400);
  }
  await post.update({ visibility });
  return { postId: Number(postId), visibility };
};

/**
 * Load a single post with author + media.
 */
export const getPostById = async (postId) => {
  const post = await Post.findOne({
    where: { id: postId, is_deleted: false },
    attributes: [
      'id', 'content', 'type', 'visibility', 'media_url',
      'is_pinned', 'is_edited', 'comments_disabled', 'location_name',
      'likes_count', 'comments_count', 'shares_count', 'created_at', 'user_id',
      'community_id',
    ],
    include: [{
      model: User,
      as: 'author',
      attributes: SAFE_USER_ATTRS,
      include: [{ model: UserProfile, as: 'profile', attributes: SAFE_PROFILE_ATTRS, required: false }],
    }, {
      model: Community,
      as: 'community',
      attributes: ['communityId', 'communityName', 'cover_image', 'is_private'],
      required: false,
    }],
  });
  if (!post) return null;
  return serializePost(post, post.author, [], post.community);
};

/**
 * Serialize a post row into a safe API response.
 * Never returns email, password, phone, or tokens.
 */
export const serializePost = (post, author, media = [], community = post.community) => ({
  id: Number(post.id),
  content: post.content || null,
  postType: post.type || 'text',
  visibility: post.visibility || 'public',
  isPinned: Boolean(post.is_pinned),
  commentsDisabled: Boolean(post.comments_disabled),
  isEdited: Boolean(post.is_edited),
  locationName: post.location_name || null,
  mediaUrl: post.media_url || (media.length > 0 ? media[0].url : null),
  mediaUrls: media.map((m) => ({ id: m.id ? Number(m.id) : null, url: m.url, type: m.type })),
  likeCount: Number(post.likes_count ?? 0),
  commentCount: Number(post.comments_count ?? 0),
  shareCount: Number(post.shares_count ?? 0),
  createdAt: post.created_at instanceof Date
    ? post.created_at.toISOString()
    : (post.created_at && post.created_at !== 'null')
      ? new Date(post.created_at).toISOString()
      : null,
  communityId: post.community_id ? Number(post.community_id) : null,
  community: community ? {
    id: Number(community.communityId),
    name: community.communityName,
    coverImage: community.cover_image || null,
    isPrivate: Boolean(community.is_private),
  } : null,
  author: author ? {
    userId: Number(author.userId),
    userName: author.userName || null,
    fullName: author.profile?.fullName || author.userName || null,
    avatarUrl: author.profile?.avatarUrl || null,
  } : null,
});

export default {
  createPost,
  updatePost,
  togglePinPost,
  toggleCommentsDisabled,
  updatePostVisibility,
  getPostById,
  serializePost,
};
