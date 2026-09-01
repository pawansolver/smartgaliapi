import Community from '../modules/community/community.model.js';
import CommunityMember from '../modules/communityMember/communityMember.model.js';
import { errorResponse } from '../utils/response.js';
import * as policy from '../modules/community/community.policy.js';

const resolveCommunityId = (req) =>
  req.params.id || req.params.communityId || req.body?.communityId || req.query?.communityId;

export const loadAccessContext = async (req) => {
  const communityId = resolveCommunityId(req);
  if (!communityId) return { error: [400, 'Community ID is required'] };
  const community = await Community.findOne({
    where: { communityId, is_deleted: false, status: 'active' },
  });
  if (!community) return { error: [404, 'Community not found'] };

  let membership = null;
  if (req.user?.id) {
    membership = await CommunityMember.findOne({
      where: { community_id: communityId, user_id: req.user.id, is_deleted: false },
    });
  }
  return { community, membership };
};

/** Public communities allow anonymous reads; private communities require active membership or ownership. */
export const requireCommunityReadAccess = async (req, res, next) => {
  try {
    const { community, membership, error } = await loadAccessContext(req);
    if (error) return errorResponse(res, ...error);

    if (!policy.canReadCommunity(community, membership, req.user)) {
      if (membership?.status === 'banned') {
        return errorResponse(res, 403, 'You are banned from accessing this community');
      }
      return errorResponse(
        res,
        req.user?.id ? 403 : 401,
        'Active membership is required to view this private community',
      );
    }
    req.community = community;
    req.communityMembership = membership;
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Require user to be an active member or creator/owner */
export const requireCommunityMember = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return errorResponse(res, 401, 'Unauthorized: User authentication required');
    }

    const { community, membership, error } = await loadAccessContext(req);
    if (error) return errorResponse(res, ...error);

    if (policy.isOwner(community, userId)) {
      req.community = community;
      req.communityMembership = membership || { role: 'admin', status: 'active', isOwner: true };
      return next();
    }

    if (!membership || membership.status !== 'active') {
      if (membership?.status === 'banned') {
        return errorResponse(res, 403, 'Forbidden: You are banned from this community');
      }
      return errorResponse(res, 403, 'Forbidden: You are not an active member of this community');
    }

    req.community = community;
    req.communityMembership = membership;
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Require specific community role (e.g. ['admin', 'moderator']) with creator bypass */
export const requireCommunityRole = (allowedRoles = ['admin', 'moderator']) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return errorResponse(res, 401, 'Unauthorized: User authentication required');
      }

      const { community, membership, error } = await loadAccessContext(req);
      if (error) return errorResponse(res, ...error);

      // Creator/owner has full super-admin access
      if (policy.isOwner(community, userId)) {
        req.community = community;
        req.communityMembership = membership || { role: 'admin', status: 'active', isOwner: true };
        return next();
      }

      if (!membership || membership.status !== 'active') {
        return errorResponse(res, 403, 'Forbidden: You are not an active member of this community');
      }

      if (!allowedRoles.includes(membership.role)) {
        return errorResponse(res, 403, `Forbidden: Requires ${allowedRoles.join(' or ')} privilege`);
      }

      req.community = community;
      req.communityMembership = membership;
      return next();
    } catch (error) {
      return next(error);
    }
  };
};
