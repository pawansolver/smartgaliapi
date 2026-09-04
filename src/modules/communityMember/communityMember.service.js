import CommunityMember from './communityMember.model.js';
import Community from '../community/community.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import { createEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import { syncCommunityChatParticipant } from '../community/communityChat.service.js';
import { logCommunityAudit } from '../community/community_audit_log.service.js';
import { invalidateCommunityMemberCache } from '../community/community.cache.js';
import * as policy from '../community/community.policy.js';

/**
 * Join a public community.
 * Transition: [null, 'left'] -> 'active'
 */
export const joinPublicCommunity = async (communityId, userId) => {
  const transaction = await sequelize.transaction();
  try {
    const community = await Community.findOne({
      where: { communityId, is_deleted: false, status: 'active' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!community) throw new Error('Community not found');
    if (community.is_private) {
      throw new Error('Cannot join private community directly. Please send a join request.');
    }

    const existing = await CommunityMember.findOne({
      where: { community_id: communityId, user_id: userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    let membership = existing;
    if (existing) {
      if (existing.status === 'banned') {
        throw new Error('You are banned from joining this community');
      }
      if (existing.status === 'active' && !existing.is_deleted) {
        await transaction.commit();
        return existing;
      }
      // Re-activating left or pending membership
      await existing.update({
        status: 'active',
        role: existing.role || 'member',
        joined_at: new Date(),
        is_deleted: false,
      }, { transaction });
    } else {
      membership = await CommunityMember.create({
        community_id: communityId,
        user_id: userId,
        role: 'member',
        status: 'active',
        joined_at: new Date(),
        created_by: userId,
      }, { transaction });
    }

    await community.increment('members_count', { by: 1, transaction });
    await syncCommunityChatParticipant(community, userId, membership, transaction);

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_MEMBER_JOINED || 'community.member_joined',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(membership.communityMemberId),
      payload: { communityId: Number(communityId), userId: Number(userId), role: 'member' },
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId: userId,
      action: 'member.joined',
      targetUserId: userId,
      newValue: { status: 'active', role: 'member' },
    }, { transaction });

    await transaction.commit();
    await invalidateCommunityMemberCache(communityId, userId);
    return membership;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * Leave a community.
 * Transition: 'active' -> 'left'
 * Protected: Last active admin / Owner cannot leave without transferring ownership/admin role.
 */
export const leaveCommunity = async (communityId, userId) => {
  const transaction = await sequelize.transaction();
  try {
    const community = await Community.findOne({
      where: { communityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!community) throw new Error('Community not found');

    const membership = await CommunityMember.findOne({
      where: { community_id: communityId, user_id: userId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!membership || membership.status !== 'active') {
      await transaction.commit();
      return null;
    }

    // Protect Owner: Owner must transfer ownership before leaving
    if (policy.isOwner(community, userId)) {
      throw new Error('Community owner cannot leave without transferring ownership first.');
    }

    // Protect sole active admin
    if (membership.role === 'admin') {
      const adminCount = await CommunityMember.count({
        where: { community_id: communityId, role: 'admin', status: 'active', is_deleted: false },
        transaction,
      });
      if (adminCount <= 1) {
        throw new Error('The sole active admin cannot leave. Promote another admin first.');
      }
    }

    await membership.update({ status: 'left', updatedAt: new Date() }, { transaction });
    await community.decrement('members_count', { by: 1, transaction });
    await syncCommunityChatParticipant(community, userId, membership, transaction);

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_MEMBER_LEFT || 'community.member_left',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(membership.communityMemberId),
      payload: { communityId: Number(communityId), userId: Number(userId) },
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId: userId,
      action: 'member.left',
      targetUserId: userId,
      oldValue: { status: 'active', role: membership.role },
      newValue: { status: 'left' },
    }, { transaction });

    await transaction.commit();
    await invalidateCommunityMemberCache(communityId, userId);
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * Change member role.
 * Enforces policy against self-promotion and owner demotion.
 */
export const updateMemberRole = async (communityId, targetUserId, newRole, actorUser) => {
  const actorUserId = typeof actorUser === 'object' ? actorUser?.id : actorUser;
  const userObj = typeof actorUser === 'object' ? actorUser : { id: actorUserId };
  if (!['admin', 'moderator', 'member'].includes(newRole)) {
    throw new Error('Invalid role specified');
  }

  const transaction = await sequelize.transaction();
  try {
    const community = await Community.findOne({
      where: { communityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!community) throw new Error('Community not found');

    const [actorMembership, targetMembership] = await Promise.all([
      CommunityMember.findOne({
        where: { community_id: communityId, user_id: actorUserId, status: 'active' },
        transaction,
      }),
      CommunityMember.findOne({
        where: { community_id: communityId, user_id: targetUserId, status: 'active' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      }),
    ]);

    if (!targetMembership) throw new Error('Active member not found in community');

    if (!policy.canChangeMemberRole(community, actorMembership, userObj, targetMembership, newRole)) {
      throw new Error('Not authorized to change role for this member');
    }

    const oldRole = targetMembership.role;
    await targetMembership.update({ role: newRole, updated_by: actorUserId, updatedAt: new Date() }, { transaction });
    await syncCommunityChatParticipant(community, targetUserId, targetMembership, transaction);

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_ROLE_CHANGED || 'community.role_changed',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(targetMembership.communityMemberId),
      payload: { communityId: Number(communityId), targetUserId: Number(targetUserId), newRole, actorUserId: Number(actorUserId) },
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId,
      action: 'member.role_changed',
      targetUserId,
      oldValue: { role: oldRole },
      newValue: { role: newRole },
    }, { transaction });

    await transaction.commit();
    await invalidateCommunityMemberCache(communityId, targetUserId);
    return targetMembership;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * Remove a member.
 * Transition: 'active' -> 'left'
 */
export const removeMember = async (communityId, targetUserId, actorUser) => {
  const actorUserId = typeof actorUser === 'object' ? actorUser?.id : actorUser;
  const userObj = typeof actorUser === 'object' ? actorUser : { id: actorUserId };
  const transaction = await sequelize.transaction();
  try {
    const community = await Community.findOne({
      where: { communityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!community) throw new Error('Community not found');

    const [actorMembership, targetMembership] = await Promise.all([
      CommunityMember.findOne({
        where: { community_id: communityId, user_id: actorUserId, status: 'active' },
        transaction,
      }),
      CommunityMember.findOne({
        where: { community_id: communityId, user_id: targetUserId, status: 'active' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      }),
    ]);

    if (!targetMembership) throw new Error('Active member not found');

    if (!policy.canRemoveMember(community, actorMembership, userObj, targetMembership)) {
      throw new Error('Not authorized to remove this member');
    }

    await targetMembership.update({ status: 'left', updated_by: actorUserId, updatedAt: new Date() }, { transaction });
    await community.decrement('members_count', { by: 1, transaction });
    await syncCommunityChatParticipant(community, targetUserId, targetMembership, transaction);

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_MEMBER_REMOVED || 'community.member_removed',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(targetMembership.communityMemberId),
      payload: { communityId: Number(communityId), targetUserId: Number(targetUserId), actorUserId: Number(actorUserId) },
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId,
      action: 'member.removed',
      targetUserId,
      oldValue: { status: 'active', role: targetMembership.role },
      newValue: { status: 'left' },
    }, { transaction });

    await transaction.commit();
    await invalidateCommunityMemberCache(communityId, targetUserId);
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * Ban a member.
 * Transition: any -> 'banned'
 */
export const banMember = async (communityId, targetUserId, actorUser) => {
  const actorUserId = typeof actorUser === 'object' ? actorUser?.id : actorUser;
  const userObj = typeof actorUser === 'object' ? actorUser : { id: actorUserId };
  const transaction = await sequelize.transaction();
  try {
    const community = await Community.findOne({
      where: { communityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!community) throw new Error('Community not found');

    const [actorMembership, targetMembership] = await Promise.all([
      CommunityMember.findOne({
        where: { community_id: communityId, user_id: actorUserId, status: 'active' },
        transaction,
      }),
      CommunityMember.findOne({
        where: { community_id: communityId, user_id: targetUserId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      }),
    ]);

    if (!policy.canBanMember(community, actorMembership, userObj, targetMembership)) {
      throw new Error('Not authorized to ban this member');
    }

    if (targetMembership) {
      if (targetMembership.status === 'active') {
        await community.decrement('members_count', { by: 1, transaction });
      }
      await targetMembership.update({ status: 'banned', updated_by: actorUserId, updatedAt: new Date() }, { transaction });
    } else {
      await CommunityMember.create({
        community_id: communityId,
        user_id: targetUserId,
        role: 'member',
        status: 'banned',
        created_by: actorUserId,
      }, { transaction });
    }

    const bannedMembership = targetMembership || await CommunityMember.findOne({
      where: { community_id: communityId, user_id: targetUserId },
      transaction,
    });

    await syncCommunityChatParticipant(community, targetUserId, bannedMembership, transaction);

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_MEMBER_BANNED || 'community.member_banned',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(bannedMembership.communityMemberId),
      payload: { communityId: Number(communityId), targetUserId: Number(targetUserId), actorUserId: Number(actorUserId) },
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId,
      action: 'member.banned',
      targetUserId,
      newValue: { status: 'banned' },
    }, { transaction });

    await transaction.commit();
    await invalidateCommunityMemberCache(communityId, targetUserId);
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * Unban a member.
 * Transition: 'banned' -> 'left'
 */
export const unbanMember = async (communityId, targetUserId, actorUser) => {
  const actorUserId = typeof actorUser === 'object' ? actorUser?.id : actorUser;
  const userObj = typeof actorUser === 'object' ? actorUser : { id: actorUserId };
  const transaction = await sequelize.transaction();
  try {
    const community = await Community.findOne({
      where: { communityId, is_deleted: false },
      transaction,
    });
    if (!community) throw new Error('Community not found');

    const membership = await CommunityMember.findOne({
      where: { community_id: communityId, user_id: targetUserId, status: 'banned' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!membership) throw new Error('Banned member record not found');

    await membership.update({ status: 'left', updated_by: actorUserId, updatedAt: new Date() }, { transaction });
    await syncCommunityChatParticipant(community, targetUserId, membership, transaction);

    await logCommunityAudit({
      communityId,
      actorUserId,
      action: 'member.unbanned',
      targetUserId,
      oldValue: { status: 'banned' },
      newValue: { status: 'left' },
    }, { transaction });

    await transaction.commit();
    await invalidateCommunityMemberCache(communityId, targetUserId);
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getCommunityMembers = async (communityId, { page = 1, limit = 50, role, search } = {}) => {
  const where = { community_id: communityId, status: 'active', is_deleted: false };
  if (role) where.role = role;

  const userWhere = { is_deleted: false };
  if (search && search.trim()) {
    userWhere[Op.or] = [
      { userName: { [Op.like]: `%${search.trim()}%` } },
    ];
  }

  const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));

  const { rows, count } = await CommunityMember.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: 'user',
        where: userWhere,
        attributes: ['userId', 'userName'],
        include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl', 'bio', 'locationName'], required: false }],
      },
    ],
    order: [
      [sequelize.literal("CASE WHEN role = 'admin' THEN 1 WHEN role = 'moderator' THEN 2 ELSE 3 END"), 'ASC'],
      ['joined_at', 'ASC'],
    ],
    limit: Math.min(100, parseInt(limit, 10)),
    offset,
  });

  return {
    members: rows,
    total: count,
    page: parseInt(page, 10),
    totalPages: Math.ceil(count / limit),
  };
};
