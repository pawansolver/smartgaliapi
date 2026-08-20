/**
 * Feed Service � Phase 9
 * -----------------------------------------------------------------------------
 * Home Feed: Cursor-based, follow-graph-powered, no N+1.
 *
 * Algorithm:
 *   1. Load all user IDs that the current user follows (from Phase 8 `follows` table)
 *   2. Query posts WHERE user_id IN (followedIds)
 *   3. Cursor-based pagination using (created_at, id) � stable even on same-timestamp posts
 *   4. Eager-load author + media in a single SQL JOIN (no N+1)
 *   5. Return serialized safe payload
 *
 * Consistency:
 *   - If user unfollows someone, next feed request automatically excludes their posts
 *   - No stale cached feed (direct DB query; Redis caching deferred to Phase 10)
 */

import { Op } from 'sequelize';
import Post from '../post/post.model.js';
import Follow from '../follow/follow.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import PostLike from '../post_like/post_like.model.js';
import PostComment from '../post_comment/post_comment.model.js';
import SavedPost from '../saved_post/saved_post.model.js';
import PostShare from '../post_share/post_share.model.js';
import { serializePost } from '../post/post.service.js';
import MediaFile from '../media_file/media_file.model.js';
import { logger } from '../../utils/logger.js';
import {
  feedRequestsTotal,
  feedRequestDuration,
} from '../../monitoring/metrics.js';

const SAFE_USER_ATTRS = ['userId', 'userName'];
const SAFE_PROFILE_ATTRS = ['fullName', 'avatarUrl'];
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

/**
 * Get the personalized home feed for a user.
 *
 * @param {number} userId - Authenticated user's ID (from JWT)
 * @param {object} options - { limit, cursor }
 *   cursor: base64-encoded JSON { id, created_at } of the last seen post
 */
export const getHomeFeed = async (userId, { limit, cursor } = {}) => {
  const end = feedRequestDuration.startTimer();
  feedRequestsTotal.inc();

  try {
    const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));

    // 1. Get followed user IDs + include own user ID so self-posts always appear
    const followRows = await Follow.findAll({
      where: { follower_id: userId, is_deleted: false },
      attributes: ['following_id'],
    });
    const followedIds = followRows.map((r) => Number(r.following_id));

    // Always include own posts in feed (even if user follows nobody)
    const allIds = [...new Set([...followedIds, Number(userId)])];

    if (allIds.length === 0) {
      return { timeline: [], notices: [], nextCursor: null, hasMore: false };
    }

    // 2. Build cursor WHERE clause
    let cursorWhere = {};
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
        if (decoded.created_at && decoded.id) {
          cursorWhere = {
            [Op.or]: [
              { created_at: { [Op.lt]: new Date(decoded.created_at) } },
              {
                created_at: new Date(decoded.created_at),
                id: { [Op.lt]: Number(decoded.id) },
              },
            ],
          };
        }
      } catch {
        // Invalid cursor  ignore and return from beginning
      }
    }

    // 3. Query posts - single efficient query with eager loading (no N+1)
    const posts = await Post.findAll({
      where: {
        user_id: { [Op.in]: allIds },
        is_deleted: false,
        ...cursorWhere,
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: SAFE_USER_ATTRS,
          include: [{
            model: UserProfile,
            as: 'profile',
            attributes: SAFE_PROFILE_ATTRS,
            required: false,
          }],
        },
      ],
      order: [
        ['created_at', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: safeLimit + 1, // Fetch one extra to determine hasMore
    });

    const hasMore = posts.length > safeLimit;
    const pagePosts = hasMore ? posts.slice(0, safeLimit) : posts;

    // 4. Batch-load like counts (no N+1)
    const postIds = pagePosts.map((p) => Number(p.id));
    const likeCounts = postIds.length > 0
      ? await PostLike.findAll({
          where: { post_id: postIds },
          attributes: ['post_id'],
        })
      : [];
    const likeMap = {};
    for (const l of likeCounts) {
      const pid = Number(l.post_id);
      likeMap[pid] = (likeMap[pid] || 0) + 1;
    }

    // 5. Batch-load comment counts (no N+1)
    const commentCounts = postIds.length > 0
      ? await PostComment.findAll({
          where: { post_id: postIds },
          attributes: ['post_id'],
        })
      : [];
    const commentMap = {};
    for (const c of commentCounts) {
      const pid = Number(c.post_id);
      commentMap[pid] = (commentMap[pid] || 0) + 1;
    }

    // 5b. Batch-load share counts (no N+1)
    const shareCounts = postIds.length > 0
      ? await PostShare.findAll({
          where: { post_id: postIds, is_deleted: false },
          attributes: ['post_id'],
        })
      : [];
    const shareMap = {};
    for (const s of shareCounts) {
      const pid = Number(s.post_id);
      shareMap[pid] = (shareMap[pid] || 0) + 1;
    }

    // 5c. Batch-load isSaved for current user (no N+1)
    const savedPosts = postIds.length > 0
      ? await SavedPost.findAll({
          where: { post_id: postIds, user_id: userId, is_deleted: false },
          attributes: ['post_id'],
        })
      : [];
    const savedSet = new Set(savedPosts.map(s => Number(s.post_id)));

    // 5d. Batch-load media files for posts that have media_url (multi-image support)
    const postsWithMedia = pagePosts.filter((p) => p.media_url);
    // Map post_id -> mediaFiles (we store media_url in posts, but use MediaFile for future multi-image)
    // For now: create synthetic 1-item array from post.media_url so serializePost gets consistent shape
    const mediaByPostId = {};
    for (const p of postsWithMedia) {
      mediaByPostId[Number(p.id)] = [{ id: null, url: p.media_url, type: p.type === 'video' ? 'video' : 'image' }];
    }

    // 6. Serialize
    const serialized = pagePosts.map((post) => ({
      ...serializePost(post, post.author, mediaByPostId[Number(post.id)] || []),
      likeCount: likeMap[Number(post.id)] || 0,
      commentCount: commentMap[Number(post.id)] || 0,
      shareCount: shareMap[Number(post.id)] || 0,
      isSaved: savedSet.has(Number(post.id)),
    }));

    // 7. Build next cursor
    let nextCursor = null;
    if (hasMore && pagePosts.length > 0) {
      const last = pagePosts[pagePosts.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ id: Number(last.id), created_at: last.created_at }),
      ).toString('base64');
    }

    // Return with 'timeline' key (matches Flutter frontend expectation)
    // 'notices' kept as empty array for now (future: society announcements)
    return { timeline: serialized, notices: [], nextCursor, hasMore };
  } finally {
    end();
  }
};

export default { getHomeFeed };
