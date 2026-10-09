import SocietyProfile from '../modules/society_profile/society_profile.model.js';
import SocietyMember from '../modules/society_member/society_member.model.js';
import { errorResponse } from '../utils/response.js';
import * as policy from '../modules/society_profile/society.policy.js';

export const resolveSocietyId = async (req) => {
  let sId = req.headers?.['x-society-id'] || req.query?.society_id || req.query?.societyId || req.body?.society_id || req.body?.societyId || req.params?.societyId;
  if (sId) return Number(sId);

  // If this is a document route (/society-documents/:id), req.params.id is the document ID
  const isDocRoute = req.baseUrl?.includes('society-document') || req.originalUrl?.includes('society-document');
  if (isDocRoute && req.params?.id) {
    try {
      const { default: SocietyDocument } = await import('../modules/society_document/society_document.model.js');
      const doc = await SocietyDocument.findByPk(req.params.id);
      if (doc && doc.society_id) {
        req.document = doc;
        return Number(doc.society_id);
      }
    } catch (e) {
      // ignore
    }
  }

  // If not a document route, req.params.id might be a societyId (e.g. /societies/:id)
  if (!isDocRoute && req.params?.id) {
    return Number(req.params.id);
  }

  // Fallback to caller's active society membership
  const userId = req.user?.id || req.user?.userId;
  if (userId) {
    try {
      const member = await SocietyMember.findOne({
        where: { user_id: userId, status: 'active', is_deleted: false },
        order: [['id', 'ASC']],
      });
      if (member) return Number(member.society_id);
    } catch (e) {
      // ignore
    }
  }

  return null;
};

/**
 * Loads and caches the active Society and caller's SocietyMember context on the request.
 */
export const loadSocietyAccessContext = async (req) => {
  const societyId = await resolveSocietyId(req);
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

    // Global Admin / Super Admin, Creator/Owner, or Society Admin has full access
    if (isOwner || policy.isGlobalAdminUser(req.user) || effectiveRole === 'owner' || effectiveRole === 'admin' || (membership?.status === 'active' && membership?.role === 'admin')) {
      req.society = society;
      req.societyMembership = membership || { role: 'admin', status: 'active', isOwner: true, isSuperAdmin: policy.isGlobalAdminUser(req.user) };
      req.societyContext = { societyId, society, membership: req.societyMembership, role: effectiveRole || 'admin', isOwner: isOwner || effectiveRole === 'owner', isSuperAdmin: policy.isGlobalAdminUser(req.user) };
      req.societyId = societyId;
      req.societyRole = effectiveRole || membership?.role || (isOwner ? 'owner' : 'admin');
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
    req.societyId = societyId;
    req.societyRole = effectiveRole || membership?.role || 'resident';
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Middleware: Requires a specific society role (e.g. ['admin', 'committee', 'security']) with creator/admin bypass.
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

      // Global Admin / Super Admin, Creator/Owner, or Society Admin has full access
      if (isOwner || policy.isGlobalAdminUser(req.user) || effectiveRole === 'owner' || effectiveRole === 'admin' || (membership?.status === 'active' && membership?.role === 'admin')) {
        req.society = society;
        req.societyMembership = membership || { role: 'admin', status: 'active', isOwner: true, isSuperAdmin: policy.isGlobalAdminUser(req.user) };
        req.societyContext = { societyId, society, membership: req.societyMembership, role: effectiveRole || 'admin', isOwner: isOwner || effectiveRole === 'owner', isSuperAdmin: policy.isGlobalAdminUser(req.user) };
        req.societyId = societyId;
        req.societyRole = effectiveRole || membership?.role || (isOwner ? 'owner' : 'admin');
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
      req.societyId = societyId;
      req.societyRole = effectiveRole || membership?.role || 'resident';
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

import { hasPermission } from '../modules/permission/permission.service.js';
import SocietyGuardAuthorization from '../modules/society_guard/society_guard_authorization.model.js';
import { SocietyCommitteeMember } from '../modules/society_committee/society_committee.model.js';

/**
 * Middleware: Requires a specific granular society permission (e.g. 'parking.slot.create', 'parking.allocate').
 * Strict RBAC: Handles creator/owner and society admin oversight, delegated committee members, and granular permission matrix.
 */
export const requireSocietyPermission = (permissionCode) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        return errorResponse(res, 401, 'Unauthorized: Authentication required');
      }

      const { societyId, society, membership, isOwner, effectiveRole, error } = await loadSocietyAccessContext(req);
      if (error) return errorResponse(res, ...error);

      // Strict RBAC: Global Admin, Creator/Owner, or Society Admin has full oversight
      if (isOwner || policy.isGlobalAdminUser(req.user) || effectiveRole === 'owner' || effectiveRole === 'admin' || (membership?.status === 'active' && membership?.role === 'admin')) {
        req.society = society;
        req.societyMembership = membership || { role: 'admin', status: 'active', isOwner: true, isSuperAdmin: policy.isGlobalAdminUser(req.user) };
        req.societyContext = { societyId, society, membership: req.societyMembership, role: effectiveRole || 'admin', isOwner: isOwner || effectiveRole === 'owner', isSuperAdmin: policy.isGlobalAdminUser(req.user) };
        req.societyId = societyId;
        req.societyRole = effectiveRole || membership?.role || (isOwner ? 'owner' : 'admin');
        return next();
      }

      // Check Society Isolation: caller must have active affiliation (membership, committee, or authorized guard)
      let hasAffiliation = membership && membership.status === 'active';
      if (!hasAffiliation) {
        const activeGuard = await SocietyGuardAuthorization.findOne({
          where: { society_id: societyId, user_id: userId, status: 'active', is_deleted: false },
        });
        if (activeGuard) hasAffiliation = true;
      }
      if (!hasAffiliation) {
        const { Op: seqOp } = await import('sequelize');
        const todayAffilDateStr = new Date().toISOString().split('T')[0];
        const activeCommitteeMember = await SocietyCommitteeMember.findOne({
          where: {
            society_id: societyId,
            user_id: userId,
            status: 'active',
            is_deleted: false,
            [seqOp.or]: [
              { end_date: null },
              { end_date: { [seqOp.gte]: todayAffilDateStr } },
            ],
          },
        });
        if (activeCommitteeMember) hasAffiliation = true;
      }

      if (!hasAffiliation) {
        return errorResponse(res, 403, 'Forbidden: You do not have an active affiliation with this society');
      }

      // Check granular permission against permission service
      const gateId = req.headers?.['x-gate-id'] || req.query?.gate_id || req.query?.gateId || req.body?.gate_id || req.body?.gateId || req.params?.gateId;
      const authorized = await hasPermission(req.user, permissionCode, { societyId, gateId });
      if (!authorized) {
        return errorResponse(res, 403, `Forbidden: Missing required permission '${permissionCode}'`);
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
  requireSocietyPermission,
};
