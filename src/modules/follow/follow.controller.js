/**
 * Follow Controller — Phase 8
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes:
 *   POST   /api/v1/users/follow         — follow a user
 *   GET    /api/v1/users/followers      — get my followers
 *   GET    /api/v1/users/following      — get users I follow
 *   DELETE /api/v1/users/unfollow/:id   — unfollow a user
 *
 * Security:
 *   - Authenticated user identity comes from req.user.id only (JWT)
 *   - Never trusts follower_id from request body
 *   - Delegates all validation to service layer
 */

import { successResponse, errorResponse } from '../../utils/response.js';
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  FollowError,
} from './follow.service.js';

/**
 * POST /api/v1/users/follow
 * Body: { userId: TARGET_USER_ID }
 */
export const follow = async (req, res, next) => {
  try {
    const followerId = req.user.id;
    const followingId = req.body?.userId;

    if (!followingId) {
      return errorResponse(res, 400, 'userId is required in request body.');
    }

    const result = await followUser(
      followerId,
      followingId,
      req.correlationId,
    );
    return successResponse(res, 201, 'Followed successfully.', result);
  } catch (error) {
    if (error instanceof FollowError) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

/**
 * GET /api/v1/users/followers?page=1&limit=20
 */
export const followers = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, limit } = req.query;

    const result = await getFollowers(userId, { page, limit });
    return successResponse(res, 200, 'Followers fetched successfully.', result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/users/following?page=1&limit=20
 */
export const following = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page, limit } = req.query;

    const result = await getFollowing(userId, { page, limit });
    return successResponse(res, 200, 'Following fetched successfully.', result);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/users/unfollow/:id
 * :id = target user ID to unfollow
 */
export const unfollow = async (req, res, next) => {
  try {
    const followerId = req.user.id;
    const followingId = req.params.id;

    if (!followingId) {
      return errorResponse(res, 400, 'Target user id is required.');
    }

    const result = await unfollowUser(
      followerId,
      followingId,
      req.correlationId,
    );
    return successResponse(res, 200, 'Unfollowed successfully.', result);
  } catch (error) {
    if (error instanceof FollowError) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

// ── Legacy CRUD (kept for backward-compat with existing routes) ───────────────
// These will be deprecated and removed once admin/internal tooling migrates.
import * as followService from './follow.service.js';

export { followService };
