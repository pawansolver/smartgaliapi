/**
 * Follow Service — Phase 8
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements:
 *   followUser()      — create follow relationship + FCM + in-app notification
 *   unfollowUser()    — remove follow relationship
 *   getFollowers()    — paginated list of users who follow the authenticated user
 *   getFollowing()    — paginated list of users the authenticated user follows
 *   isFollowing()     — boolean check (used internally and for tests)
 *
 * Design rules:
 *  - Authenticated user identity ALWAYS comes from req.user (never request body)
 *  - FCM failure does NOT roll back a successful follow
 *  - Sensitive data (tokens, emails, passwords) never returned
 *  - No N+1 queries (eager-loaded with Sequelize includes)
 *  - All errors propagated to Express error middleware
 */

import { Op, UniqueConstraintError } from 'sequelize';
import Follow from './follow.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import { createNotification } from '../notification/notification.service.js';
import { sendToUser } from '../../infrastructure/notifications/push.service.js';
import { logger } from '../../utils/logger.js';
import {
  followsTotal,
  followsFailedTotal,
  unfollowsTotal,
  followFcmSent,
  followFcmFailed,
} from '../../monitoring/metrics.js';

// ── Safe user attributes (never expose password/otp/tokens) ──────────────────
const SAFE_USER_ATTRIBUTES = ['userId', 'userName'];
const SAFE_PROFILE_ATTRIBUTES = ['fullName', 'avatarUrl'];

/** Mutable deps for tests. */
export const followServiceDeps = {
  sendToUser: (args) => sendToUser(args),
  createNotification: (data) => createNotification(data),
};

// ── Error types ───────────────────────────────────────────────────────────────
export class FollowError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'FollowError';
    this.statusCode = statusCode;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Load user with safe attributes. Returns null if not found or soft-deleted.
 */
const loadSafeUser = async (userId) => {
  return User.findOne({
    where: { userId, is_deleted: false, is_active: true },
    attributes: [...SAFE_USER_ATTRIBUTES, 'status'],
    include: [{
      model: UserProfile,
      as: 'profile',
      attributes: SAFE_PROFILE_ATTRIBUTES,
      required: false,
    }],
  });
};

/**
 * Serialize a follow row's user side into a safe API shape.
 * Never returns email, phone, password, OTP, or FCM tokens.
 */
const serializeUser = (user) => ({
  userId: Number(user.userId),
  userName: user.userName || null,
  fullName: user.profile?.fullName || null,
  avatarUrl: user.profile?.avatarUrl || null,
});

// ── 1. Follow ─────────────────────────────────────────────────────────────────

/**
 * Authenticated user (follower) follows target user (following_id).
 *
 * @param {number} followerId   — from req.user.id (never body)
 * @param {number} followingId  — target user ID from request body
 * @param {string} correlationId — for structured logging
 */
export const followUser = async (followerId, followingId, correlationId) => {
  // 1. Self-follow guard
  if (String(followerId) === String(followingId)) {
    followsFailedTotal.inc({ reason: 'self_follow' });
    throw new FollowError('You cannot follow yourself.', 400);
  }

  // 2. Target user must exist and be active
  const targetUser = await loadSafeUser(followingId);
  if (!targetUser) {
    followsFailedTotal.inc({ reason: 'user_not_found' });
    throw new FollowError('User not found.', 404);
  }

  // 3. Create follow (UniqueConstraintError → already following)
  let follow;
  try {
    follow = await Follow.create({
      follower_id: followerId,
      following_id: followingId,
      created_by: followerId,
      is_active: true,
      is_deleted: false,
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      followsFailedTotal.inc({ reason: 'duplicate' });
      throw new FollowError('You are already following this user.', 409);
    }
    followsFailedTotal.inc({ reason: 'db_error' });
    throw err;
  }

  followsTotal.inc();
  logger.info('FOLLOW', 'user_followed', {
    correlationId,
    followId: Number(follow.id),
  });

  // 4. Load follower info for notification (do NOT expose from response)
  let followerUser;
  try {
    followerUser = await loadSafeUser(followerId);
  } catch {
    followerUser = null;
  }

  const followerName = followerUser?.profile?.fullName
    || followerUser?.userName
    || 'Someone';

  // 5. In-app notification (non-blocking — failure does not undo follow)
  try {
    await followServiceDeps.createNotification({
      user_id: followingId,
      title: 'New Follower',
      message: `${followerName} started following you.`,
      type: 'info',
      data: { type: 'FOLLOW', followerId: Number(followerId) },
      created_by: followerId,
      is_active: true,
      is_deleted: false,
    });
  } catch (notifErr) {
    logger.error('FOLLOW', 'in_app_notification_failed', {
      correlationId,
      error: notifErr.message,
    });
    // Non-fatal — follow succeeded
  }

  // 6. FCM push notification (non-blocking — failure does not undo follow)
  try {
    const fcmResult = await followServiceDeps.sendToUser({
      userId: followingId,
      title: 'New Follower',
      body: `${followerName} started following you.`,
      data: {
        type: 'FOLLOW',
        followerId: String(followerId),
      },
    });

    if (fcmResult && (fcmResult.sent > 0 || fcmResult.skipped >= 0)) {
      followFcmSent.inc();
      logger.info('FOLLOW', 'fcm_sent', { correlationId });
    }
  } catch (fcmErr) {
    followFcmFailed.inc();
    logger.error('FOLLOW', 'fcm_failed', {
      correlationId,
      error: fcmErr.message,
    });
    // Non-fatal — follow persists regardless of FCM failure
  }

  return {
    followId: Number(follow.id),
    followingId: Number(followingId),
    message: `You are now following ${followerName || 'this user'}.`,
  };
};

// ── 2. Unfollow ───────────────────────────────────────────────────────────────

/**
 * Authenticated user unfollows target user.
 * Idempotent: returns success even if relationship did not exist.
 *
 * @param {number} followerId   — from req.user.id
 * @param {number} followingId  — target user from URL param
 * @param {string} correlationId
 */
export const unfollowUser = async (followerId, followingId, correlationId) => {
  if (String(followerId) === String(followingId)) {
    throw new FollowError('You cannot unfollow yourself.', 400);
  }

  const deleted = await Follow.destroy({
    where: {
      follower_id: followerId,
      following_id: followingId,
      is_deleted: false,
    },
  });

  if (deleted > 0) {
    unfollowsTotal.inc();
    logger.info('FOLLOW', 'user_unfollowed', { correlationId });
  } else {
    logger.info('FOLLOW', 'unfollow_noop', {
      correlationId,
      reason: 'relationship_not_found',
    });
  }

  // Idempotent: always succeed
  return { unfollowed: deleted > 0 };
};

// ── 3. Get Followers ──────────────────────────────────────────────────────────

/**
 * Returns paginated list of users who follow the given userId.
 * Safe: never exposes password, email, phone, or tokens.
 *
 * @param {number} userId — the user whose followers to fetch
 * @param {object} pagination — { page, limit }
 */
export const getFollowers = async (userId, { page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const { count, rows } = await Follow.findAndCountAll({
    where: { following_id: userId, is_deleted: false },
    include: [{
      model: User,
      as: 'follower',
      attributes: SAFE_USER_ATTRIBUTES,
      where: { is_deleted: false, is_active: true },
      required: true,
      include: [{
        model: UserProfile,
        as: 'profile',
        attributes: SAFE_PROFILE_ATTRIBUTES,
        required: false,
      }],
    }],
    limit: safeLimit,
    offset,
    order: [['id', 'DESC']],
  });

  return {
    total: count,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(count / safeLimit),
    followers: rows.map((r) => serializeUser(r.follower)),
  };
};

// ── 4. Get Following ──────────────────────────────────────────────────────────

/**
 * Returns paginated list of users that the given userId follows.
 *
 * @param {number} userId — the user whose following list to fetch
 * @param {object} pagination — { page, limit }
 */
export const getFollowing = async (userId, { page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const { count, rows } = await Follow.findAndCountAll({
    where: { follower_id: userId, is_deleted: false },
    include: [{
      model: User,
      as: 'following',
      attributes: SAFE_USER_ATTRIBUTES,
      where: { is_deleted: false, is_active: true },
      required: true,
      include: [{
        model: UserProfile,
        as: 'profile',
        attributes: SAFE_PROFILE_ATTRIBUTES,
        required: false,
      }],
    }],
    limit: safeLimit,
    offset,
    order: [['id', 'DESC']],
  });

  return {
    total: count,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(count / safeLimit),
    following: rows.map((r) => serializeUser(r.following)),
  };
};

// ── 5. Is Following (internal / testing) ─────────────────────────────────────

/**
 * Returns true if follower_id follows following_id.
 * Used in tests and can be used for UI "is following" badge.
 */
export const isFollowing = async (followerId, followingId) => {
  const row = await Follow.findOne({
    where: {
      follower_id: followerId,
      following_id: followingId,
      is_deleted: false,
    },
    attributes: ['id'],
  });
  return !!row;
};

export default { followUser, unfollowUser, getFollowers, getFollowing, isFollowing };
