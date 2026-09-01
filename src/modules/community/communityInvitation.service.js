import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import CommunityInvitation from './communityInvitation.model.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import Community from './community.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import { syncCommunityChatParticipant } from './communityChat.service.js';
import { createEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import { logCommunityAudit } from './community_audit_log.service.js';
import { invalidateCommunityMemberCache } from './community.cache.js';

export const getInviteableUsers = async (communityId, { search = '', page = 1, limit = 20 } = {}) => {
  const memberships = await CommunityMember.findAll({
    where: { community_id: communityId, status: { [Op.in]: ['active', 'banned'] }, is_deleted: false },
    attributes: ['user_id'],
  });
  const excluded = memberships.map((row) => row.user_id);
  const where = { is_deleted: false, is_active: true, status: 'active' };
  if (excluded.length) where.userId = { [Op.notIn]: excluded };
  if (search) where.userName = { [Op.like]: `%${search}%` };
  const safeLimit = Math.min(100, Number(limit) || 20);
  const safePage = Math.max(1, Number(page) || 1);
  const { rows, count } = await User.findAndCountAll({
    where,
    attributes: ['userId', 'userName'],
    include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl'], required: false }],
    order: [['userName', 'ASC']],
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  });
  return { users: rows, total: count, page: safePage, totalPages: Math.ceil(count / safeLimit) };
};

export const getMyInvitations = async (
  userId,
  { status = 'pending', page = 1, limit = 20 } = {},
) => {
  const safeLimit = Math.min(100, Number(limit) || 20);
  const safePage = Math.max(1, Number(page) || 1);
  const { rows, count } = await CommunityInvitation.findAndCountAll({
    where: { invited_user_id: userId, status },
    include: [
      {
        model: Community,
        as: 'community',
        where: { status: 'active', is_deleted: false },
        attributes: ['communityId', 'communityName', 'communityDescription', 'cover_image', 'is_private'],
        required: true,
      },
      {
        model: User,
        as: 'inviter',
        attributes: ['userId', 'userName'],
        required: false,
      },
    ],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  });
  return {
    invitations: rows,
    total: count,
    page: safePage,
    totalPages: Math.ceil(count / safeLimit),
  };
};

export const sendInvitations = async (communityId, invitedBy, userIds) => sequelize.transaction(async (transaction) => {
  const community = await Community.findOne({
    where: { communityId, status: 'active', is_deleted: false },
    transaction,
  });
  if (!community) throw new Error('Community not found');

  const uniqueUserIds = [...new Set(userIds.map(Number))].filter(Number.isSafeInteger);
  const validUsers = await User.findAll({
    where: { userId: uniqueUserIds, is_deleted: false, is_active: true, status: 'active' },
    attributes: ['userId'],
    transaction,
  });
  const validUserIds = new Set(validUsers.map((user) => Number(user.userId)));
  const results = [];

  for (const userId of uniqueUserIds) {
    if (!validUserIds.has(userId)) continue;
    const membership = await CommunityMember.findOne({
      where: { community_id: communityId, user_id: userId },
      transaction,
    });
    if (membership?.status === 'active' || membership?.status === 'banned') continue;
    const [invitation, created] = await CommunityInvitation.findOrCreate({
      where: { community_id: communityId, invited_user_id: userId, pending_key: 1 },
      defaults: { invited_by: invitedBy, status: 'pending', created_at: new Date(), updated_at: new Date() },
      transaction,
    });
    results.push(invitation);
    if (created) {
      await createEvent({
        event_type: OUTBOX_EVENT_TYPES.COMMUNITY_INVITED || 'community.invited',
        aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
        aggregate_id: String(invitation.id),
        payload: { communityId: Number(communityId), userId, actorUserId: Number(invitedBy), invitationId: Number(invitation.id) },
      }, { transaction });

      await logCommunityAudit({
        communityId,
        actorUserId: invitedBy,
        action: 'invitation.sent',
        targetUserId: userId,
        targetEntityType: 'invitation',
        targetEntityId: invitation.id,
      }, { transaction });
    }
  }
  return results;
});

export const respondToInvitation = async (communityId, invitationId, userId, action) => sequelize.transaction(async (transaction) => {
  const invitation = await CommunityInvitation.findOne({
    where: {
      id: invitationId,
      community_id: communityId,
      invited_user_id: userId,
      status: 'pending',
      pending_key: 1,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!invitation) throw new Error('Pending invitation not found');

  await invitation.update({
    status: action === 'accept' ? 'accepted' : 'declined',
    pending_key: null,
    responded_at: new Date(),
    updated_at: new Date(),
  }, { transaction });

  if (action === 'accept') {
    const community = await Community.findOne({
      where: { communityId: invitation.community_id, status: 'active', is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!community) throw new Error('Community not found');

    const [membership, created] = await CommunityMember.findOrCreate({
      where: { community_id: invitation.community_id, user_id: userId },
      defaults: { role: 'member', status: 'active', joined_at: new Date(), created_by: invitation.invited_by },
      transaction,
    });
    const wasActive = !created && membership.status === 'active' && !membership.is_deleted;
    if (!wasActive) {
      await membership.update({ status: 'active', role: 'member', is_deleted: false, joined_at: new Date() }, { transaction });
      await community.increment('members_count', { by: 1, transaction });
    }
    await syncCommunityChatParticipant(community, userId, membership, transaction);

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_MEMBER_JOINED || 'community.member_joined',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(membership.communityMemberId || membership.id),
      payload: { communityId: Number(invitation.community_id), userId: Number(userId), role: 'member' },
    }, { transaction });
  }

  await logCommunityAudit({
    communityId,
    actorUserId: userId,
    action: action === 'accept' ? 'invitation.accepted' : 'invitation.declined',
    targetUserId: userId,
    targetEntityType: 'invitation',
    targetEntityId: invitation.id,
  }, { transaction });

  return invitation;
});
