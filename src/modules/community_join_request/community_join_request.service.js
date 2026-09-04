import CommunityJoinRequest from './community_join_request.model.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import Community from '../community/community.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import sequelize from '../../config/db.js';
import { createEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import { syncCommunityChatParticipant } from '../community/communityChat.service.js';
import { logCommunityAudit } from '../community/community_audit_log.service.js';
import { invalidateCommunityMemberCache } from '../community/community.cache.js';

export const createJoinRequest = async (communityId, userId, note = '') => {
  const transaction = await sequelize.transaction();
  try {
    const community = await Community.findOne({
      where: { communityId, is_deleted: false, status: 'active' },
      transaction,
    });
    if (!community) throw new Error('Community not found');

    const existingMember = await CommunityMember.findOne({
      where: { community_id: communityId, user_id: userId },
      transaction,
    });
    if (existingMember && existingMember.status === 'active' && !existingMember.is_deleted) {
      throw new Error('You are already an active member of this community');
    }
    if (existingMember && existingMember.status === 'banned') {
      throw new Error('You are banned from this community');
    }

    const [request, created] = await CommunityJoinRequest.findOrCreate({
      where: { community_id: communityId, user_id: userId, pending_key: 1 },
      defaults: {
        community_id: communityId,
        user_id: userId,
        note: (note || 'Request to join community').trim().slice(0, 1000),
        status: 'pending',
        pending_key: 1,
        created_by: userId,
        created_at: new Date(),
      },
      transaction,
    });

    if (created) {
      await createEvent({
        event_type: OUTBOX_EVENT_TYPES.COMMUNITY_JOIN_REQUEST || 'community.join_request',
        aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
        aggregate_id: String(request.id),
        payload: { communityId: Number(communityId), userId: Number(userId), requestId: Number(request.id) },
      }, { transaction });

      await logCommunityAudit({
        communityId,
        actorUserId: userId,
        action: 'join_request.created',
        targetUserId: userId,
        targetEntityType: 'join_request',
        targetEntityId: request.id,
      }, { transaction });
    }

    await transaction.commit();
    return request;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getJoinRequests = async (communityId, { page = 1, limit = 20 } = {}) => {
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));

  const { rows, count } = await CommunityJoinRequest.findAndCountAll({
    where: { community_id: communityId, status: 'pending', is_deleted: false },
    include: [
      {
        model: User,
        as: 'applicant',
        attributes: ['userId', 'userName'],
        include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl', 'tower_number', 'flat_number'], required: false }],
      },
    ],
    order: [['created_at', 'ASC']],
    limit: Math.min(50, parseInt(limit, 10)),
    offset,
  });

  return {
    requests: rows,
    total: count,
    page: parseInt(page, 10),
    totalPages: Math.ceil(count / limit),
  };
};

export const approveJoinRequest = async (communityId, requestId, actorUser) => {
  const actorUserId = typeof actorUser === 'object' ? actorUser?.id : actorUser;
  if (actorUserId === undefined) {
    actorUserId = requestId;
    requestId = communityId;
    communityId = undefined;
  }

  const transaction = await sequelize.transaction();
  try {
    const request = await CommunityJoinRequest.findOne({
      where: {
        id: requestId,
        ...(communityId !== undefined ? { community_id: communityId } : {}),
        status: 'pending',
        is_deleted: false,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!request) {
      await transaction.commit();
      return true; // Idempotent approval
    }

    const effectiveCommunityId = communityId ?? request.community_id;
    const community = await Community.findOne({
      where: { communityId: effectiveCommunityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!community) throw new Error('Community not found');

    await request.update({
      status: 'approved',
      reviewed_by: actorUserId,
      reviewed_at: new Date(),
      updated_by: actorUserId,
      pending_key: null,
    }, { transaction });

    const existingMember = await CommunityMember.findOne({
      where: { community_id: effectiveCommunityId, user_id: request.user_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const wasActive = existingMember?.status === 'active' && !existingMember?.is_deleted;
    if (existingMember) {
      await existingMember.update({ status: 'active', role: 'member', joined_at: new Date(), is_deleted: false }, { transaction });
    } else {
      await CommunityMember.create({
        community_id: effectiveCommunityId,
        user_id: request.user_id,
        role: 'member',
        status: 'active',
        joined_at: new Date(),
        created_by: actorUserId,
      }, { transaction });
    }

    const membership = existingMember || await CommunityMember.findOne({
      where: { community_id: effectiveCommunityId, user_id: request.user_id },
      transaction,
    });

    if (!wasActive) await community.increment('members_count', { by: 1, transaction });
    await syncCommunityChatParticipant(community, request.user_id, membership, transaction);

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_JOIN_APPROVED || 'community.join_approved',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(request.id),
      payload: { communityId: Number(effectiveCommunityId), userId: Number(request.user_id), requestId: Number(requestId) },
    }, { transaction });

    await logCommunityAudit({
      communityId: effectiveCommunityId,
      actorUserId,
      action: 'join_request.approved',
      targetUserId: request.user_id,
      targetEntityType: 'join_request',
      targetEntityId: request.id,
    }, { transaction });

    await transaction.commit();
    await invalidateCommunityMemberCache(effectiveCommunityId, request.user_id);
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const rejectJoinRequest = async (communityId, requestId, actorUser) => {
  const actorUserId = typeof actorUser === 'object' ? actorUser?.id : actorUser;
  if (actorUserId === undefined) {
    actorUserId = requestId;
    requestId = communityId;
    communityId = undefined;
  }

  const transaction = await sequelize.transaction();
  try {
    const request = await CommunityJoinRequest.findOne({
      where: {
        id: requestId,
        ...(communityId !== undefined ? { community_id: communityId } : {}),
        status: 'pending',
        is_deleted: false,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!request) {
      await transaction.commit();
      return true; // Idempotent rejection
    }

    const effectiveCommunityId = communityId ?? request.community_id;
    await request.update({
      status: 'rejected',
      reviewed_by: actorUserId,
      reviewed_at: new Date(),
      updated_by: actorUserId,
      pending_key: null,
    }, { transaction });

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_JOIN_REJECTED || 'community.join_rejected',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(request.id),
      payload: { communityId: Number(effectiveCommunityId), userId: Number(request.user_id), requestId: Number(requestId) },
    }, { transaction });

    await logCommunityAudit({
      communityId: effectiveCommunityId,
      actorUserId,
      action: 'join_request.rejected',
      targetUserId: request.user_id,
      targetEntityType: 'join_request',
      targetEntityId: request.id,
    }, { transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
