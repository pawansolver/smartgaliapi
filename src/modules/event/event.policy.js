/**
 * Event Authorization & RBAC Policy Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized authorization rules for all Event operations.
 * Enforces principle of least privilege, IDOR protection, community isolation,
 * and status transition integrity.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { EVENT_STATUS, EVENT_VISIBILITY } from './event.model.js';

export const isEventCreator = (event, userId) => {
  if (!event || !userId) return false;
  return Number(event.created_by) === Number(userId);
};

export const getEffectiveCommunityRole = (membership, userId) => {
  if (!userId) return 'anonymous';
  if (!membership || membership.is_deleted) return 'non_member';
  if (membership.status === 'banned') return 'banned';
  if (membership.status === 'removed' || membership.status === 'left') return 'left';
  if (membership.status === 'pending') return 'pending';
  if (membership.status === 'active') return membership.role || 'member';
  return 'non_member';
};

export const canReadEvent = (event, user, communityMembership = null, community = null) => {
  if (!event || event.is_deleted) return false;

  const userId = user?.id || user?.userId;

  // Creator can always read their own draft/event
  if (userId && isEventCreator(event, userId)) return true;

  // Non-creators cannot view drafts
  if (event.status === EVENT_STATUS.DRAFT) return false;

  // 1. Public visibility
  if (event.visibility === EVENT_VISIBILITY.PUBLIC && !event.community_id) {
    return true;
  }

  // 2. Community-scoped event
  if (event.community_id) {
    const role = getEffectiveCommunityRole(communityMembership, userId);
    if (role === 'banned' || role === 'left') return false;

    // If community is public and event is public within community
    if (community && !community.is_private && event.visibility !== EVENT_VISIBILITY.PRIVATE) {
      return true;
    }

    // Active community members can read
    return role === 'owner' || role === 'admin' || role === 'moderator' || role === 'member';
  }

  // 3. Private event
  if (event.visibility === EVENT_VISIBILITY.PRIVATE) {
    if (!userId) return false;
    if (isEventCreator(event, userId)) return true;
    const role = getEffectiveCommunityRole(communityMembership, userId);
    return role === 'owner' || role === 'admin' || role === 'moderator';
  }

  return true;
};

export const canCreateEvent = (user, community = null, communityMembership = null) => {
  const userId = user?.id || user?.userId;
  if (!userId) return false;

  // Community-scoped event creation
  if (community) {
    const role = getEffectiveCommunityRole(communityMembership, userId);
    if (role === 'banned' || role === 'left' || role === 'pending' || role === 'non_member') {
      return false;
    }
    // Owners, Admins, Moderators can always create community events
    if (role === 'owner' || role === 'admin' || role === 'moderator') return true;
    // Regular members can create if community allows
    return role === 'member';
  }

  // Public/neighborhood events: Any active authenticated user
  return true;
};

export const canUpdateEvent = (event, user, communityMembership = null) => {
  const userId = user?.id || user?.userId;
  if (!userId || !event || event.is_deleted) return false;

  // Creator can always update
  if (isEventCreator(event, userId)) return true;

  // Community admin/moderator/owner can update community events
  if (event.community_id && communityMembership) {
    const role = getEffectiveCommunityRole(communityMembership, userId);
    return role === 'owner' || role === 'admin' || role === 'moderator';
  }

  return false;
};

export const canDeleteEvent = (event, user, communityMembership = null) => {
  const userId = user?.id || user?.userId;
  if (!userId || !event || event.is_deleted) return false;

  // Creator can delete
  if (isEventCreator(event, userId)) return true;

  // Community owner or admin can delete
  if (event.community_id && communityMembership) {
    const role = getEffectiveCommunityRole(communityMembership, userId);
    return role === 'owner' || role === 'admin';
  }

  return false;
};

export const canCancelEvent = (event, user, communityMembership = null) => {
  const userId = user?.id || user?.userId;
  if (!userId || !event || event.is_deleted) return false;

  if (isEventCreator(event, userId)) return true;

  if (event.community_id && communityMembership) {
    const role = getEffectiveCommunityRole(communityMembership, userId);
    return role === 'owner' || role === 'admin' || role === 'moderator';
  }

  return false;
};

export const canRsvpEvent = (event, user, communityMembership = null, community = null) => {
  const userId = user?.id || user?.userId;
  if (!userId) return false;
  if (!event || event.is_deleted) return false;

  // Cannot RSVP to cancelled or completed events
  if (event.status === EVENT_STATUS.CANCELLED || event.status === EVENT_STATUS.COMPLETED || event.status === EVENT_STATUS.DRAFT) {
    return false;
  }

  // Must be permitted to view the event
  return canReadEvent(event, user, communityMembership, community);
};
