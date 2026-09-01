/**
 * Feed Service - Scalability Hardening Phase 10
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Optimizations:
 *   1. Mute + Block loaded in single UNION query (saves 1 DB round-trip)
 *   2. isLikedByMe batch-fetched for all post IDs in one query
 *   3. Redis per-user feed cache (30s TTL, first page only, privacy-safe)
 *   4. SELECT only required post columns (no SELECT *)
 *   5. feedCacheHitsTotal / feedCacheMissesTotal Prometheus metrics
 *
 * Cache Invalidation:
 *   Call invalidateFeedCache(userId) on:
 *     post created, post deleted, post edited, visibility changed,
 *     pin/unpin, follow/unfollow, block/unblock, mute/unmute.
 *
 *   For privacy-sensitive changes (block, mute, visibility):
 *     cache is invalidated immediately so stale data never leaks.
 *
 *   Redis failure: falls back gracefully to DB - never breaks the API.
 */

import sequelize from '../../config/db.js';
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
import Community from '../community/community.model.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import { logger } from '../../utils/logger.js';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis.js';
import {
  feedRequestsTotal,
  feedRequestDuration,
  feedCacheHitsTotal,
  feedCacheMissesTotal,
  feedDbQueryDuration,
} from '../../monitoring/metrics.js';

const SAFE_USER_ATTRS = ['userId', 'userName'];
const SAFE_PROFILE_ATTRS = ['fullName', 'avatarUrl'];

// Only the columns the feed actually needs - avoids SELECT *
const POST_FEED_ATTRS = [
  'id', 'user_id', 'content', 'type', 'visibility',
  'media_url', 'is_pinned', 'is_edited', 'comments_disabled',
  'location_name', 'likes_count', 'comments_count', 'shares_count',
  'created_at', 'community_id',
];

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const FEED_CACHE_TTL = 30; // seconds
const FEED_CACHE_KEY = (userId) => `feed:home:${userId}`;

/**
 * Invalidate a user's feed cache.
 * Call this on any mutation that can change the feed:
 *   post created/deleted/edited, visibility change, pin, follow, block, mute.
 *
 * Privacy rule: for block/mute/visibility changes, this MUST be called
 * immediately so stale cached content never leaks.
 */
export const invalidateFeedCache = async (userId) => {
  if (!userId) return;
  await cacheDel(FEED_CACHE_KEY(userId)).catch(() => {});
};

/**
 * Get the personalized home feed for a user.
 *
 * @param {number} userId - Authenticated user's ID (from JWT)
 * @param {object} options - { limit, cursor }
 */
export const getHomeFeed = async (userId, { limit, cursor } = {}) => {
  const end = feedRequestDuration.startTimer();
  feedRequestsTotal.inc();

  try {
    const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));

    // --- Redis cache: only cache first page (no cursor) for 30 seconds ---
    const isCacheable = !cursor && safeLimit === DEFAULT_LIMIT;
    if (isCacheable) {
      const cached = await cacheGet(FEED_CACHE_KEY(userId));
      if (cached) {
        feedCacheHitsTotal.inc();
        logger.info('FEED', 'feed_cache_hit', { userId });
        return cached;
      }
      feedCacheMissesTotal.inc();
    }

    // --- 1. Get followed user IDs ---
    const followRows = await Follow.findAll({
      where: { follower_id: userId, is_deleted: false },
      attributes: ['following_id'],
    });
    const followedIds = followRows.map((r) => Number(r.following_id));
    const allIds = [...new Set([...followedIds, Number(userId)])];

    // --- 2. Load muted + blocked IDs in a single UNION query (saves 1 DB round-trip) ---
    const excludedRows = await sequelize.query(
      'SELECT muted_user_id AS excluded_id FROM user_mutes WHERE user_id = ? ' +
      'UNION SELECT blocked_user_id FROM user_blocks WHERE user_id = ?',
      {
        replacements: [userId, userId],
        type: sequelize.QueryTypes.SELECT,
      }
    ).catch(() => []);

    const excludedUserIds = new Set(excludedRows.map((r) => Number(r.excluded_id)));
    const filteredIds = allIds.filter((id) => id === Number(userId) || !excludedUserIds.has(id));

    const memberships = await CommunityMember.findAll({
      where: { user_id: userId, status: 'active', is_deleted: false },
      attributes: ['community_id'],
      include: [{
        model: Community,
        as: 'community',
        attributes: [],
        where: { is_deleted: false, status: 'active' },
        required: true,
      }],
    });
    const joinedCommunityIds = memberships.map((row) => Number(row.community_id));

    // --- 3. Build cursor WHERE clause ---
    let cursorWhere = {};
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
        if (decoded.created_at && decoded.id) {
          cursorWhere = {
            [Op.or]: [
              { created_at: { [Op.lt]: new Date(decoded.created_at) } },
              { created_at: new Date(decoded.created_at), id: { [Op.lt]: Number(decoded.id) } },
            ],
          };
        }
      } catch {
        // Invalid cursor - return from beginning
      }
    }

    // --- 4. Query posts - select only required columns, single JOIN (no N+1) ---
    const dbTimer = feedDbQueryDuration.startTimer();
    const posts = await Post.findAll({
      attributes: POST_FEED_ATTRS,
      where: {
        is_deleted: false,
        is_active: true,
        [Op.or]: [
          { visibility: 'public', user_id: { [Op.in]: filteredIds } },
          { visibility: 'followers', user_id: { [Op.in]: followedIds } },
          { visibility: { [Op.in]: ['private', 'friends'] }, user_id: userId },
          ...(joinedCommunityIds.length
            ? [{ visibility: 'community', community_id: { [Op.in]: joinedCommunityIds } }]
            : []),
        ],
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
        {
          model: Community,
          as: 'community',
          attributes: ['communityId', 'communityName', 'cover_image', 'is_private'],
          required: false,
          where: { is_deleted: false, status: 'active' },
        },
      ],
      order: [['created_at', 'DESC'], ['id', 'DESC']],
      limit: safeLimit + 1,
    });
    dbTimer();

    const hasMore = posts.length > safeLimit;
    const pagePosts = hasMore ? posts.slice(0, safeLimit) : posts;
    const postIds = pagePosts.map((p) => Number(p.id));

    // --- 5. Batch-load all engagement data in parallel (no N+1) ---
    const [likeRows, commentRows, shareRows, savedRows, likedByMeRows] = await Promise.all([
      postIds.length > 0
        ? PostLike.findAll({ where: { post_id: postIds }, attributes: ['post_id'] })
        : [],
      postIds.length > 0
        ? PostComment.findAll({ where: { post_id: postIds, is_deleted: false }, attributes: ['post_id'] })
        : [],
      postIds.length > 0
        ? PostShare.findAll({ where: { post_id: postIds, is_deleted: false }, attributes: ['post_id'] })
        : [],
      postIds.length > 0
        ? SavedPost.findAll({ where: { post_id: postIds, user_id: userId, is_deleted: false }, attributes: ['post_id'] })
        : [],
      // isLikedByMe: single batch query for all post IDs
      postIds.length > 0
        ? PostLike.findAll({ where: { post_id: postIds, user_id: userId }, attributes: ['post_id'] })
        : [],
    ]);

    const likeMap = {};
    for (const l of likeRows) { const pid = Number(l.post_id); likeMap[pid] = (likeMap[pid] || 0) + 1; }

    const commentMap = {};
    for (const c of commentRows) { const pid = Number(c.post_id); commentMap[pid] = (commentMap[pid] || 0) + 1; }

    const shareMap = {};
    for (const s of shareRows) { const pid = Number(s.post_id); shareMap[pid] = (shareMap[pid] || 0) + 1; }

    const savedSet = new Set(savedRows.map((s) => Number(s.post_id)));
    const likedByMeSet = new Set(likedByMeRows.map((l) => Number(l.post_id)));

    // --- 5b. Media files (synthetic from post.media_url) ---
    const mediaByPostId = {};
    for (const p of pagePosts) {
      if (p.media_url) {
        mediaByPostId[Number(p.id)] = [{ id: null, url: p.media_url, type: p.type === 'video' ? 'video' : 'image' }];
      }
    }

    // --- 6. Serialize ---
    const serialized = pagePosts.map((post) => ({
      ...serializePost(post, post.author, mediaByPostId[Number(post.id)] || [], post.community),
      likeCount: likeMap[Number(post.id)] || 0,
      commentCount: commentMap[Number(post.id)] || 0,
      shareCount: shareMap[Number(post.id)] || 0,
      isSaved: savedSet.has(Number(post.id)),
      isLikedByMe: likedByMeSet.has(Number(post.id)),
    }));

    // --- 7. Build next cursor ---
    let nextCursor = null;
    if (hasMore && pagePosts.length > 0) {
      const last = pagePosts[pagePosts.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ id: Number(last.id), created_at: last.created_at }),
      ).toString('base64');
    }

    const result = { timeline: serialized, posts: serialized, notices: [], nextCursor, hasMore };

    // --- 8. Cache first-page result ---
    if (isCacheable) {
      await cacheSet(FEED_CACHE_KEY(userId), result, FEED_CACHE_TTL).catch(() => {});
    }

    return result;
  } finally {
    end();
  }
};

export default { getHomeFeed, invalidateFeedCache };
