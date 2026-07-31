import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import FeedPost from './feed_post.model.js';
import PostLike from './post_like.model.js';
import Notice from './notice.model.js';
import PostComment from '../post_comment/post_comment.model.js';
import PrivacySetting from '../profile/privacy_setting.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import { emitNotification, resolveDisplayName } from '../notification/notification.service.js';

// ── Haversine bounding box helper (degrees per km) ──────────────
const KM_PER_DEGREE_LAT = 0.009009; // 1 km ≈ 0.009009° latitude
const FEED_RADIUS_KM = 5;           // Hyperlocal: 5 km radius

function getBoundingBox(lat, lon, radiusKm = FEED_RADIUS_KM) {
  const deltaLat = radiusKm * KM_PER_DEGREE_LAT;
  const deltaLon = radiusKm * KM_PER_DEGREE_LAT / Math.cos((lat * Math.PI) / 180);
  return {
    minLat: lat - deltaLat,
    maxLat: lat + deltaLat,
    minLon: lon - deltaLon,
    maxLon: lon + deltaLon,
  };
}

/**
 * GET /api/v1/feed
 * Returns notices + timeline posts within 5km of the logged-in user's location.
 * Supports infinite scroll via ?page=1&limit=10
 */
export const getHomeFeed = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page   = Math.max(1, parseInt(req.query.page  || '1', 10));
    const limit  = Math.min(50, parseInt(req.query.limit || '10', 10));
    const offset = (page - 1) * limit;

    // ── Step 1: Get user's saved coordinates ─────────────────────
    const user = await User.findByPk(userId, {
      attributes: ['userId', 'latitude', 'longitude'],
      include: [{
        model: UserProfile,
        as: 'profile',
        attributes: ['fullName'],
        required: false,
      }],
    });

    if (!user || !user.latitude || !user.longitude) {
      return errorResponse(res, 422, 'User location not set. Please complete profile setup first.');
    }

    const userLat = parseFloat(user.latitude);
    const userLon = parseFloat(user.longitude);
    const bbox    = getBoundingBox(userLat, userLon, FEED_RADIUS_KM);

    // ── Step 2: Fetch active notices within radius ────────────────
    const notices = await Notice.findAll({
      where: {
        isActive: true,
        latitude:  { [Op.between]: [bbox.minLat, bbox.maxLat] },
        longitude: { [Op.between]: [bbox.minLon, bbox.maxLon] },
      },
      attributes: ['id', 'title', 'content', 'scheduledTime'],
      order: [['created_at', 'DESC']],
      limit: 5, // show max 5 notices in the card
    });

    // ── Step 3: Fetch hyperlocal posts + author info ──────────────
    const { rows: posts, count: totalPosts } = await FeedPost.findAndCountAll({
      where: {
        is_deleted: false,
        is_active:  true,
        latitude:   { [Op.between]: [bbox.minLat, bbox.maxLat] },
        longitude:  { [Op.between]: [bbox.minLon, bbox.maxLon] },
      },
      include: [
        {
          model: UserProfile,
          as: 'authorProfile',
          attributes: ['fullName', 'avatarUrl'],
          foreignKey: 'user_id',
          required: false,
        },
      ],
      attributes: ['id', 'content', 'media_url', 'likes_count', 'comments_count', 'created_at', 'user_id'],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    // ── Step 4: Check which posts current user has liked ──────────
    const postIds = posts.map(p => p.id);
    const myLikes = postIds.length > 0
      ? await PostLike.findAll({
          where: { user_id: userId, post_id: { [Op.in]: postIds } },
          attributes: ['post_id'],
        })
      : [];
    const likedSet = new Set(myLikes.map(l => String(l.post_id)));

    // Derive comment counts from active comment rows. This also repairs stale
    // cached counters created before comments_count was updated on writes.
    const commentCountRows = postIds.length > 0
      ? await PostComment.findAll({
          where: {
            post_id: { [Op.in]: postIds },
            is_deleted: false,
          },
          attributes: [
            'post_id',
            [sequelize.fn('COUNT', sequelize.col('id')), 'commentsCount'],
          ],
          group: ['post_id'],
          raw: true,
        })
      : [];
    const commentCountByPost = new Map(
      commentCountRows.map(row => [String(row.post_id), Number(row.commentsCount) || 0])
    );

    const authorIds = [...new Set(posts.map((post) => String(post.user_id)))];
    const privacyRows = authorIds.length > 0
      ? await PrivacySetting.findAll({
          where: { user_id: { [Op.in]: authorIds }, is_deleted: false },
          attributes: ['user_id', 'profile_visibility', 'show_activity_status'],
          raw: true,
        })
      : [];
    const privacyByUser = new Map(
      privacyRows.map((row) => [String(row.user_id), row])
    );

    const membershipRows = authorIds.length > 0
      ? await SocietyMember.findAll({
          where: {
            user_id: { [Op.in]: [...authorIds, String(userId)] },
            status: 'active',
            is_active: true,
            is_deleted: false,
          },
          attributes: ['user_id', 'society_id'],
          raw: true,
        })
      : [];
    const societiesByUser = new Map();
    membershipRows.forEach((row) => {
      const key = String(row.user_id);
      if (!societiesByUser.has(key)) societiesByUser.set(key, new Set());
      societiesByUser.get(key).add(String(row.society_id));
    });
    const viewerSocieties = societiesByUser.get(String(userId)) || new Set();
    const canViewAuthor = (authorId) => {
      if (String(authorId) === String(userId)) return true;
      const privacy = privacyByUser.get(String(authorId));
      if (!privacy || privacy.profile_visibility === 'public') return true;
      const authorSocieties = societiesByUser.get(String(authorId)) || new Set();
      return [...authorSocieties].some((societyId) => viewerSocieties.has(societyId));
    };

    // ── Step 5: Build response timeline ──────────────────────────
    const timeline = posts.map(post => {
      const profileVisible = canViewAuthor(post.user_id);
      const privacy = privacyByUser.get(String(post.user_id));
      return {
        id:            post.id,
        content:       post.content,
        mediaUrl:      post.media_url,
        likesCount:    post.likes_count || 0,
        commentsCount: commentCountByPost.get(String(post.id)) || 0,
        isLikedByMe:   likedSet.has(String(post.id)),
        createdAt:     post.created_at,
        user: {
          fullName: profileVisible
            ? (post.authorProfile?.fullName || 'SmartGalli User')
            : 'Private member',
          avatarUrl: profileVisible ? (post.authorProfile?.avatarUrl || null) : null,
          showActivityStatus: profileVisible && (privacy?.show_activity_status ?? true),
        },
      };
    });

    // ── Step 6: Build human-readable location name ────────────────
    const locationName = `Your Neighborhood (${FEED_RADIUS_KM}km)`;

    return successResponse(res, 200, 'Feed fetched successfully.', {
      locationName,
      userLat,
      userLon,
      pagination: { page, limit, total: totalPosts, pages: Math.ceil(totalPosts / limit) },
      notices,
      timeline,
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/feed/post
 * Create a new post in the hyperlocal feed.
 * Body: { content, mediaUrl? }
 */
export const createPost = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { content, mediaUrl } = req.body;

    if (!content || !content.trim()) {
      return errorResponse(res, 400, 'Post content cannot be empty.');
    }

    // Get user's saved location for the post
    const user = await User.findByPk(userId, {
      attributes: ['latitude', 'longitude'],
    });

    if (!user?.latitude || !user?.longitude) {
      return errorResponse(res, 422, 'User location not set. Please complete profile setup first.');
    }

    const post = await FeedPost.create({
      user_id:   userId,
      content:   content.trim(),
      media_url: mediaUrl || null,
      latitude:  user.latitude,
      longitude: user.longitude,
      likes_count:    0,
      comments_count: 0,
    });

    return successResponse(res, 201, 'Post created successfully.', {
      id:        post.id,
      content:   post.content,
      mediaUrl:  post.media_url,
      createdAt: post.created_at,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/feed/post/:id/like
 * Toggle like on a post — atomic via Sequelize transaction.
 */
export const toggleLikePost = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const userId = req.user.id;
    const postId = parseInt(req.params.id, 10);

    const post = await FeedPost.findByPk(postId, { transaction: t });
    if (!post) {
      await t.rollback();
      return errorResponse(res, 404, 'Post not found.');
    }

    const existingLike = await PostLike.findOne({
      where: { user_id: userId, post_id: postId },
      transaction: t,
    });

    let action;
    if (existingLike) {
      // ── Unlike: remove like row, decrement counter ────────────
      await existingLike.destroy({ transaction: t });
      await post.update(
        { likes_count: Math.max(0, (post.likes_count || 1) - 1) },
        { transaction: t }
      );
      action = 'unliked';
    } else {
      // ── Like: create row, increment counter ───────────────────
      await PostLike.create(
        { user_id: userId, post_id: postId },
        { transaction: t }
      );
      await post.update(
        { likes_count: (post.likes_count || 0) + 1 },
        { transaction: t }
      );
      action = 'liked';
    }

    await t.commit();

    // ── Reload to get DB-confirmed count (avoids stale in-memory value) ──
    await post.reload();

    // ── Real-time notification to the post owner (only on like) ──
    if (action === 'liked') {
      const actorName = await resolveDisplayName(userId);
      await emitNotification({
        recipientId: post.user_id,
        actorId: userId,
        type: 'info',
        title: 'New like',
        message: `${actorName} liked your post`,
        data: { kind: 'post_like', postId },
      });
    }

    return successResponse(res, 200, `Post ${action} successfully.`, {
      postId,
      action,
      likesCount: post.likes_count,   // post.reload() gives us the confirmed DB value
      isLikedByMe: action === 'liked',
    });
  } catch (error) {
    await t.rollback();
    next(error);
  }
};
