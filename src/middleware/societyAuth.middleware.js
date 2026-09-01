import SocietyProfile from '../modules/society_profile/society_profile.model.js';
import SocietyMember from '../modules/society_member/society_member.model.js';
import { errorResponse } from '../utils/response.js';
import * as policy from '../modules/society_profile/society.policy.js';

export const resolveSocietyId = (req) =>
  req.params.societyId || req.params.id || req.body?.society_id || req.body?.societyId || req.query?.society_id || req.query?.societyId;

/**
 * Loads and caches the active Society and caller's SocietyMember context on the request.
 */
export const loadSocietyAccessContext = async (req) => {
  const societyId = resolveSocietyId(req);
  if (!societyId) {
    return { error: [400, 'Society ID is required'] };
  }

  const society = await SocietyProfile.findOne({
    where: { id: societyId, is_deleted: false },
  });
  if (!society) {
    return { error: [404, 'Society not found'] };
  }

  let membership = null;
  const userId = req.user?.id || req.user?.userId;
  if (userId) {
    membership = await SocietyMember.findOne({
      where: { society_id: societyId, user_id: userId, is_deleted: false },
    });
  }

  const isOwner = policy.isOwner(society, userId);
  const effectiveRole = policy.getEffectiveRole(society, membership, userId);

  return { societyId: Number(societyId), society, membership, isOwner, effectiveRole };
};

/**
 * Middleware: Requires an active society membership or society owner/creator bypass.
 */
export const requireSocietyMember = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return errorResponse(res, 401, 'Unauthorized: Authentication required');
    }

    const { societyId, society, membership, isOwner, effectiveRole, error } = await loadSocietyAccessContext(req);
    if (error) return errorResponse(res, ...error);

    if (isOwner) {
      req.society = society;
      req.societyMembership = membership || { role: 'admin', status: 'active', isOwner: true };
      req.societyContext = { societyId, society, membership: req.societyMembership, role: 'owner', isOwner: true };
      return next();
    }

    if (!membership || membership.status !== 'active') {
      if (membership?.status === 'pending') {
        return errorResponse(res, 403, 'Forbidden: Your society membership is pending approval');
      }
      if (membership?.status === 'rejected' || membership?.status === 'inactive') {
        return errorResponse(res, 403, 'Forbidden: Your society membership is not active');
      }
      return errorResponse(res, 403, 'Forbidden: You are not an active member of this society');
    }

    req.society = society;
    req.societyMembership = membership;
    req.societyContext = { societyId, society, membership, role: effectiveRole, isOwner: false };
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Middleware: Requires a specific society role (e.g. ['admin', 'committee', 'security']) with creator bypass.
 */
export const requireSocietyRole = (allowedRoles = ['admin', 'committee']) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        return errorResponse(res, 401, 'Unauthorized: Authentication required');
      }

      const { societyId, society, membership, isOwner, effectiveRole, error } = await loadSocietyAccessContext(req);
      if (error) return errorResponse(res, ...error);

      if (isOwner) {
        req.society = society;
        req.societyMembership = membership || { role: 'admin', status: 'active', isOwner: true };
        req.societyContext = { societyId, society, membership: req.societyMembership, role: 'owner', isOwner: true };
        return next();
      }

      if (!membership || membership.status !== 'active') {
        return errorResponse(res, 403, 'Forbidden: You are not an active member of this society');
      }

      if (!allowedRoles.includes(membership.role)) {
        return errorResponse(res, 403, `Forbidden: Requires ${allowedRoles.join(' or ')} privilege`);
      }

      req.society = society;
      req.societyMembership = membership;
      req.societyContext = { societyId, society, membership, role: effectiveRole, isOwner: false };
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

export default {
  resolveSocietyId,
  loadSocietyAccessContext,
  requireSocietyMember,
  requireSocietyRole,
};
