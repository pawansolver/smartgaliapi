import * as committeeService from './society_committee.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const createCommittee = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const committee = await committeeService.createCommittee(societyId, actorUserId, req.body, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 201, 'Committee created successfully', committee);
  } catch (err) {
    next(err);
  }
};

export const getCommittees = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const list = await committeeService.getCommittees(societyId, req.query);
    return successResponse(res, 200, 'Committees retrieved successfully', list);
  } catch (err) {
    next(err);
  }
};

export const getCommitteeById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const committee = await committeeService.getCommitteeById(req.params.id, societyId);
    if (!committee) return errorResponse(res, 404, 'Committee not found');
    return successResponse(res, 200, 'Committee details retrieved', committee);
  } catch (err) {
    next(err);
  }
};

export const updateCommittee = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const updated = await committeeService.updateCommittee(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!updated) return errorResponse(res, 404, 'Committee not found');
    return successResponse(res, 200, 'Committee updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

export const deleteCommittee = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const deleted = await committeeService.deleteCommittee(req.params.id, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!deleted) return errorResponse(res, 404, 'Committee not found');
    return successResponse(res, 200, 'Committee deleted successfully');
  } catch (err) {
    next(err);
  }
};

export const addMember = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const member = await committeeService.addCommitteeMember(req.params.id, societyId, actorUserId, req.body, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 201, 'Committee invitation sent successfully', member);
  } catch (err) {
    next(err);
  }
};

export const removeMember = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const removed = await committeeService.removeCommitteeMember(req.params.id, req.params.userId, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!removed) return errorResponse(res, 404, 'Committee member not found');
    return successResponse(res, 200, 'Committee member removed successfully');
  } catch (err) {
    next(err);
  }
};

export const suspendMember = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const member = await committeeService.suspendCommitteeMember(req.params.id, req.params.userId, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 200, 'Committee member suspended successfully', member);
  } catch (err) {
    next(err);
  }
};

export const revokeMember = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const member = await committeeService.revokeCommitteeMember(req.params.id, req.params.userId, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 200, 'Committee member revoked successfully', member);
  } catch (err) {
    next(err);
  }
};

export const activateMember = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const member = await committeeService.activateCommitteeMember(req.params.id, req.params.userId, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 200, 'Committee member activated successfully', member);
  } catch (err) {
    next(err);
  }
};

export const assignPermissions = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const updated = await committeeService.assignCommitteePermissions(
      req.params.id,
      societyId,
      actorUserId,
      req.body.permissions || [],
      req.body.memberId || null,
      {
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }
    );
    return successResponse(res, 200, 'Permissions updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

export const searchUsers = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const users = await committeeService.searchUsersForCommittee(societyId, req.query.q || '');
    return successResponse(res, 200, 'Matching users', users);
  } catch (err) {
    next(err);
  }
};

// ─── Invitation Endpoints ───────────────────────────────────────────────────

export const getInvitationById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const callerUserId = req.user?.id || req.user?.userId;
    const invitation = await committeeService.getInvitationById(req.params.invitationId, societyId, callerUserId);
    if (!invitation) return errorResponse(res, 404, 'Invitation not found');
    return successResponse(res, 200, 'Invitation details', invitation);
  } catch (err) {
    next(err);
  }
};

export const getMyInvitations = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const callerUserId = req.user?.id || req.user?.userId;
    const invitations = await committeeService.getMyCommitteeInvitations(societyId, callerUserId);
    return successResponse(res, 200, 'My committee invitations', invitations);
  } catch (err) {
    next(err);
  }
};

export const getMyMemberships = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const callerUserId = req.user?.id || req.user?.userId;
    const memberships = await committeeService.getMyCommitteeMemberships(societyId, callerUserId);
    return successResponse(res, 200, 'My active committee memberships', memberships);
  } catch (err) {
    next(err);
  }
};

export const acceptInvitation = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const callerUserId = req.user?.id || req.user?.userId;
    const member = await committeeService.acceptInvitation(req.params.invitationId, societyId, callerUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 200, 'Committee invitation accepted successfully', member);
  } catch (err) {
    next(err);
  }
};

export const rejectInvitation = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const callerUserId = req.user?.id || req.user?.userId;
    const member = await committeeService.rejectInvitation(req.params.invitationId, societyId, callerUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 200, 'Committee invitation declined successfully', member);
  } catch (err) {
    next(err);
  }
};

export const resendInvitation = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const member = await committeeService.resendInvitation(req.params.invitationId, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 200, 'Committee invitation resent successfully', member);
  } catch (err) {
    next(err);
  }
};

export const cancelInvitation = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const cancelled = await committeeService.cancelInvitation(req.params.invitationId, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!cancelled) return errorResponse(res, 404, 'Invitation not found');
    return successResponse(res, 200, 'Committee invitation cancelled successfully');
  } catch (err) {
    next(err);
  }
};

export const getPermissionCatalog = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.params.societyId;
    const catalog = await committeeService.getPermissionCatalog(societyId);
    return successResponse(res, 200, 'Committee permission catalog', catalog);
  } catch (err) {
    next(err);
  }
};
