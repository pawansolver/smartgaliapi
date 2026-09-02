/**
 * Community Authorization & RBAC Policy Layer - Phase 2
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized authorization rules for all Community operations.
 * Enforces strict principle of least privilege, IDOR protection,
 * and prevents privilege escalation (e.g. self-promotion, admin-to-owner escalation).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const isOwner = (community, userId) => {
  if (!community || !userId) return false;
  return Number(community.created_by) === Number(userId);
};

export const getEffectiveRole = (community, membership, userId) => {
  if (!userId) return 'anonymous';
  if (isOwner(community, userId)) return 'owner';
  if (!membership || membership.status !== 'active' || membership.is_deleted) {
    if (membership?.status === 'banned') return 'banned';
    if (membership?.status === 'pending') return 'pending';
    if (membership?.status === 'left') return 'left';
    return 'non_member';
  }
  return membership.role || 'member';
};

export const canReadCommunity = (community, membership, user) => {
  if (!community || community.is_deleted || (community.status && community.status !== 'active')) return false;
  if (!community.is_private) return true;
  const role = getEffectiveRole(community, membership, user?.id);
  return role === 'owner' || role === 'admin' || role === 'moderator' || role === 'member';
};

export const canUpdateCommunity = (community, membership, user) => {
  if (user?.role === 'admin' || user?.userRole === 'admin') return true;
  const role = getEffectiveRole(community, membership, user?.id);
  return role === 'owner' || role === 'admin' || role === 'moderator';
};

export const canDeleteCommunity = (community, membership, user) => {
  if (user?.role === 'admin' || user?.userRole === 'admin') return true;
  return isOwner(community, user?.id);
};

export const canTransferOwnership = (community, membership, user, newOwnerId) => {
  if (!newOwnerId || Number(user?.id) === Number(newOwnerId)) return false;
  return isOwner(community, user?.id);
};

export const canManageMembers = (community, membership, user) => {
  if (user?.role === 'admin') return true;
  const role = getEffectiveRole(community, membership, user?.id);
  return role === 'owner' || role === 'admin' || role === 'moderator';
};

export const canApproveJoinRequest = (community, membership, user) => {
  if (user?.role === 'admin') return true;
  const role = getEffectiveRole(community, membership, user?.id);
  return role === 'owner' || role === 'admin' || role === 'moderator';
};

export const canRejectJoinRequest = (community, membership, user) => {
  if (user?.role === 'admin') return true;
  const role = getEffectiveRole(community, membership, user?.id);
  return role === 'owner' || role === 'admin' || role === 'moderator';
};

export const canChangeMemberRole = (community, membership, user, targetMember, newRole) => {
  const actorRole = getEffectiveRole(community, membership, user?.id);
  if (!['owner', 'admin'].includes(actorRole)) return false;
  if (!['admin', 'moderator', 'member'].includes(newRole)) return false;

  const targetUserId = targetMember?.user_id || targetMember?.userId;
  if (isOwner(community, targetUserId)) return false;
  if (Number(user?.id) === Number(targetUserId)) return false;
  if (actorRole === 'admin' && targetMember?.role === 'admin' && !isOwner(community, user?.id)) {
    return false;
  }
  return true;
};

export const canRemoveMember = (community, membership, user, targetMember) => {
  const actorRole = getEffectiveRole(community, membership, user?.id);
  if (!['owner', 'admin', 'moderator'].includes(actorRole)) return false;

  const targetUserId = targetMember?.user_id || targetMember?.userId;
  if (isOwner(community, targetUserId)) return false;
  if (actorRole === 'moderator' && (targetMember?.role === 'admin' || targetMember?.role === 'moderator')) {
    return false;
  }
  return true;
};

export const canBanMember = (community, membership, user, targetMember) => {
  const actorRole = getEffectiveRole(community, membership, user?.id);
  if (!['owner', 'admin'].includes(actorRole)) return false;

  const targetUserId = targetMember?.user_id || targetMember?.userId;
  if (isOwner(community, targetUserId)) return false;
  if (Number(user?.id) === Number(targetUserId)) return false;
  return true;
};

export const canUnbanMember = (community, membership, user) => {
  const actorRole = getEffectiveRole(community, membership, user?.id);
  return actorRole === 'owner' || actorRole === 'admin';
};

export const canSendInvitations = (community, membership, user) => {
  const role = getEffectiveRole(community, membership, user?.id);
  return role === 'owner' || role === 'admin' || role === 'moderator';
};

export const canCreateCommunityPost = (community, membership, user) => {
  const role = getEffectiveRole(community, membership, user?.id);
  return ['owner', 'admin', 'moderator', 'member'].includes(role);
};

export const canCreateAnnouncement = (community, membership, user) => {
  const role = getEffectiveRole(community, membership, user?.id);
  return ['owner', 'admin', 'moderator'].includes(role);
};

export const canDeleteAnnouncement = (community, membership, user, announcement) => {
  const role = getEffectiveRole(community, membership, user?.id);
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'moderator' && announcement && Number(announcement.created_by) === Number(user?.id)) return true;
  return false;
};

export const canUploadDocument = (community, membership, user) => {
  const role = getEffectiveRole(community, membership, user?.id);
  return ['owner', 'admin', 'moderator'].includes(role);
};

export const canDeleteDocument = (community, membership, user, doc) => {
  const role = getEffectiveRole(community, membership, user?.id);
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'moderator' && doc && Number(doc.uploaded_by || doc.created_by) === Number(user?.id)) return true;
  return false;
};

export const canUploadMedia = (community, membership, user) => {
  const role = getEffectiveRole(community, membership, user?.id);
  return ['owner', 'admin', 'moderator', 'member'].includes(role);
};

export const canDeleteMedia = (community, membership, user, media) => {
  const role = getEffectiveRole(community, membership, user?.id);
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'moderator') return true;
  if (media && Number(media.uploaded_by || media.created_by) === Number(user?.id)) return true;
  return false;
};

export const canCreatePoll = (community, membership, user) => {
  const role = getEffectiveRole(community, membership, user?.id);
  return ['owner', 'admin', 'moderator'].includes(role);
};

export const canDeletePoll = (community, membership, user, poll) => {
  if (user?.role === 'admin' || user?.userRole === 'admin') return true;
  const role = getEffectiveRole(community, membership, user?.id);
  if (role === 'owner' || role === 'admin' || role === 'moderator') return true;
  if (poll && Number(poll.created_by) === Number(user?.id)) return true;
  return false;
};

export const canVotePoll = (community, membership, user, poll) => {
  if (poll?.expires_at && new Date(poll.expires_at) < new Date()) return false;
  const role = getEffectiveRole(community, membership, user?.id);
  return ['owner', 'admin', 'moderator', 'member'].includes(role);
};
