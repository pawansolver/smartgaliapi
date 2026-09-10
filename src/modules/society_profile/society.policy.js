/**
 * Society RBAC & Authorization Policy Layer
 * "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
 * Centralized authorization rules for all Society operations.
 * Enforces principle of least privilege, IDOR protection, tenancy isolation,
 * and status transition integrity.
 * "?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?"?
 */

export const SOCIETY_ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  COMMITTEE: 'committee',
  SECURITY: 'security',
  MEMBER: 'member',
  TENANT: 'tenant',
});

export const SOCIETY_PERMISSIONS = Object.freeze({
  SOCIETY_VIEW: 'SOCIETY_VIEW',
  SOCIETY_MANAGE: 'SOCIETY_MANAGE',
  MEMBER_VIEW: 'MEMBER_VIEW',
  MEMBER_APPROVE: 'MEMBER_APPROVE',
  MEMBER_REMOVE: 'MEMBER_REMOVE',
  MEMBER_ROLE_UPDATE: 'MEMBER_ROLE_UPDATE',
  ANNOUNCEMENT_VIEW: 'ANNOUNCEMENT_VIEW',
  ANNOUNCEMENT_CREATE: 'ANNOUNCEMENT_CREATE',
  ANNOUNCEMENT_UPDATE: 'ANNOUNCEMENT_UPDATE',
  ANNOUNCEMENT_DELETE: 'ANNOUNCEMENT_DELETE',
  COMPLAINT_CREATE: 'COMPLAINT_CREATE',
  COMPLAINT_VIEW: 'COMPLAINT_VIEW',
  COMPLAINT_UPDATE: 'COMPLAINT_UPDATE',
  COMPLAINT_MANAGE: 'COMPLAINT_MANAGE',
  VISITOR_CREATE: 'VISITOR_CREATE',
  VISITOR_VIEW: 'VISITOR_VIEW',
  VISITOR_APPROVE: 'VISITOR_APPROVE',
  VISITOR_CHECKIN: 'VISITOR_CHECKIN',
  VISITOR_CHECKOUT: 'VISITOR_CHECKOUT',
  VISITOR_DENY: 'VISITOR_DENY',
  FACILITY_VIEW: 'FACILITY_VIEW',
  FACILITY_MANAGE: 'FACILITY_MANAGE',
  PARKING_VIEW: 'PARKING_VIEW',
  PARKING_ALLOCATE: 'PARKING_ALLOCATE',
  PARKING_MANAGE: 'PARKING_MANAGE',
  POLL_VIEW: 'POLL_VIEW',
  POLL_CREATE: 'POLL_CREATE',
  POLL_UPDATE: 'POLL_UPDATE',
  POLL_CLOSE: 'POLL_CLOSE',
  POLL_VOTE: 'POLL_VOTE',
});

export const isSuperAdminUser = (user) => {
  if (!user) return false;
  const role = String(user.userRole || user.role || '').toLowerCase().trim();
  return role === 'super_admin' || role === 'superadmin';
};

export const isGlobalAdminUser = (user) => {
  if (!user) return false;
  const role = String(user.userRole || user.role || '').toLowerCase().trim();
  return role === 'super_admin' || role === 'superadmin' || role === 'admin';
};

export const isOwner = (society, userId) => {
  if (!society || !userId) return false;
  return Number(society.user_id) === Number(userId) || Number(society.created_by) === Number(userId);
};

export const getEffectiveRole = (society, membership, userId) => {
  if (!userId) return 'anonymous';
  if (isOwner(society, userId)) return 'owner';
  if (!membership || membership.is_deleted) return 'non_member';
  if (membership.status === 'rejected' || membership.status === 'inactive') return 'inactive';
  if (membership.status === 'pending') return 'pending';
  if (membership.status === 'active') return membership.role || 'member';
  return 'non_member';
};

export const canViewSociety = (society, membership, user) => {
  if (!society || society.is_deleted) return false;
  return true; // Public discovery of society profile is permitted
};

export const canManageSociety = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return role === 'owner' || role === 'admin';
};

export const canViewMembers = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee', 'security', 'member', 'tenant'].includes(role);
};

export const canApproveMember = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee'].includes(role);
};

export const canRemoveMember = (society, membership, user, targetMember = null) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  if (role === 'owner' || role === 'admin') return true;
  // User can leave society themselves
  if (targetMember && Number(targetMember.user_id) === Number(user?.id)) return true;
  return false;
};

export const canUpdateMemberRole = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return role === 'owner' || role === 'admin';
};

export const canTransferOwnership = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  return isOwner(society, user?.id);
};

export const canViewAnnouncements = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee', 'security', 'member', 'tenant'].includes(role);
};

export const canCreateAnnouncement = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee'].includes(role);
};

export const canUpdateAnnouncement = (society, membership, user, announcement = null) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'committee' && announcement && Number(announcement.created_by) === Number(user?.id)) return true;
  return false;
};

export const canDeleteAnnouncement = (society, membership, user, announcement = null) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'committee' && announcement && Number(announcement.created_by) === Number(user?.id)) return true;
  return false;
};

export const canCreateComplaint = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee', 'member', 'tenant'].includes(role);
};

export const canViewComplaint = (society, membership, user, complaint) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  if (['owner', 'admin', 'committee'].includes(role)) return true;
  if (complaint && Number(complaint.user_id) === Number(user?.id)) return true;
  if (complaint && Number(complaint.assigned_to) === Number(user?.id)) return true;
  return false;
};

export const canUpdateComplaint = (society, membership, user, complaint) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  if (['owner', 'admin', 'committee'].includes(role)) return true;
  if (complaint && Number(complaint.assigned_to) === Number(user?.id)) return true;
  if (complaint && Number(complaint.user_id) === Number(user?.id) && complaint.status === 'open') return true;
  return false;
};

export const canManageComplaint = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee'].includes(role);
};

export const canCreateVisitor = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee', 'security', 'member', 'tenant'].includes(role);
};

export const canViewVisitor = (society, membership, user, visitor) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  if (['owner', 'admin', 'committee', 'security'].includes(role)) return true;
  if (visitor && Number(visitor.user_id) === Number(user?.id)) return true;
  return false;
};

export const canApproveVisitor = (society, membership, user, visitor) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  if (['owner', 'admin', 'security'].includes(role)) return true;
  if (visitor && Number(visitor.user_id) === Number(user?.id)) return true;
  return false;
};

export const canCheckInVisitor = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'security'].includes(role);
};

export const canCheckOutVisitor = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'security'].includes(role);
};

export const canViewFacilities = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee', 'security', 'member', 'tenant'].includes(role);
};

export const canManageFacilities = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee'].includes(role);
};

export const canViewParking = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee', 'security', 'member', 'tenant'].includes(role);
};

export const canAllocateParking = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee'].includes(role);
};

export const canViewPolls = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee', 'security', 'member', 'tenant'].includes(role);
};

export const canCreatePoll = (society, membership, user) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee'].includes(role);
};

export const canUpdatePoll = (society, membership, user, poll = null) => {
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'committee' && poll && Number(poll.created_by) === Number(user?.id)) return true;
  return false;
};

export const canVotePoll = (society, membership, user, poll = null) => {
  if (poll) {
    if (poll.status !== 'active') return false;
    if (poll.expires_at && new Date(poll.expires_at) < new Date()) return false;
  }
  if (isGlobalAdminUser(user)) return true;
  const role = getEffectiveRole(society, membership, user?.id);
  return ['owner', 'admin', 'committee', 'member', 'tenant'].includes(role);
};
