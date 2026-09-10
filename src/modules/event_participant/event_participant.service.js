/**
 * Concurrency-Safe Event Participant & RSVP Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Enforces atomic RSVP transitions, capacity validation, delta counter updates,
 * transactional outbox events, and duplicate prevention.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Op, Transaction } from 'sequelize';
import sequelize from '../../config/db.js';
import EventParticipant, { RSVP_STATUS } from './event_participant.model.js';
import Event, { EVENT_STATUS } from '../event/event.model.js';
import User from '../user/user.model.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import Community from '../community/community.model.js';
import Chat from '../chat/chat.model.js';
import ChatParticipant from '../chat_participant/chat_participant.model.js';
import { revokeUserFromChatRoom } from '../../socket.js';
import { canRsvpEvent } from '../event/event.policy.js';
import { createEvent as createOutboxEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import { invalidateEventCaches } from '../event/event.cache.js';
import { eventRsvpTotal } from '../../monitoring/metrics.js';
import { emitNotification } from '../notification/notification.service.js';

export const setEventRsvp = async (eventId, userId, newStatus) => {
  return await sequelize.transaction(async (t) => {
    // 1. Lock the event row FOR UPDATE to prevent race conditions
    const event = await Event.findOne({
      where: { id: eventId, is_deleted: false },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (!event) {
      const error = new Error('Event not found or has been deleted');
      error.statusCode = 404;
      throw error;
    }

    if (event.status === EVENT_STATUS.CANCELLED) {
      const error = new Error('Cannot RSVP to a cancelled event');
      error.statusCode = 400;
      throw error;
    }

    if (event.status === EVENT_STATUS.COMPLETED) {
      const error = new Error('Cannot RSVP to a completed event');
      error.statusCode = 400;
      throw error;
    }

    // 2. Validate Community Membership & Permissions if community-scoped
    let communityMembership = null;
    let community = null;
    if (event.community_id) {
      community = await Community.findOne({
        where: { communityId: event.community_id, is_deleted: false },
        transaction: t,
      });
      communityMembership = await CommunityMember.findOne({
        where: { community_id: event.community_id, user_id: userId, is_deleted: false },
        transaction: t,
      });
    }

    const permitted = canRsvpEvent(event, { id: userId }, communityMembership, community);
    if (!permitted) {
      const error = new Error('You are not authorized to RSVP to this event');
      error.statusCode = 403;
      throw error;
    }

    // 3. Find existing participant record for this user (with lock)
    let participant = await EventParticipant.findOne({
      where: { event_id: eventId, user_id: userId },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    const previousStatus = (participant && !participant.is_deleted && participant.is_active) ? participant.status : null;

    // If same active status, return idempotently
    if (previousStatus === newStatus) {
      return {
        participant,
        event: {
          id: event.id,
          going_count: event.going_count,
          interested_count: event.interested_count,
          declined_count: event.declined_count,
        },
        changed: false,
      };
    }

    // 4. Calculate delta changes
    let goingDelta = 0;
    let interestedDelta = 0;
    let declinedDelta = 0;

    if (previousStatus === RSVP_STATUS.GOING) goingDelta -= 1;
    else if (previousStatus === RSVP_STATUS.INTERESTED) interestedDelta -= 1;
    else if (previousStatus === RSVP_STATUS.DECLINED) declinedDelta -= 1;

    if (newStatus === RSVP_STATUS.GOING) goingDelta += 1;
    else if (newStatus === RSVP_STATUS.INTERESTED) interestedDelta += 1;
    else if (newStatus === RSVP_STATUS.DECLINED) declinedDelta += 1;

    // 5. Capacity Check: If going, ensure capacity is not exceeded
    if (newStatus === RSVP_STATUS.GOING && event.max_participants !== null && event.max_participants > 0) {
      const projectedGoing = Number(event.going_count) + goingDelta;
      if (projectedGoing > Number(event.max_participants)) {
        try { (await import('../../monitoring/metrics.js')).eventCapacityRejectionTotal.inc(); } catch (_) {}
        const error = new Error(`Event capacity of ${event.max_participants} attendees has been reached`);
        error.statusCode = 409;
        throw error;
      }
    }

    // 6. Update or Create Participant record
    if (participant) {
      await participant.update({
        status: newStatus,
        is_deleted: false,
        is_active: true,
        joined_at: new Date(),
        updatedAt: new Date(),
        updated_by: userId,
      }, { transaction: t });
    } else {
      participant = await EventParticipant.create({
        event_id: eventId,
        user_id: userId,
        status: newStatus,
        is_deleted: false,
        is_active: true,
        created_by: userId,
        joined_at: new Date(),
        created_at: new Date(),
      }, { transaction: t });
    }

    // 7. Update Event Counters atomically
    const newGoingCount = Math.max(0, Number(event.going_count) + goingDelta);
    const newInterestedCount = Math.max(0, Number(event.interested_count) + interestedDelta);
    const newDeclinedCount = Math.max(0, Number(event.declined_count) + declinedDelta);

    await event.update({
      going_count: newGoingCount,
      interested_count: newInterestedCount,
      declined_count: newDeclinedCount,
      updatedAt: new Date(),
      updated_by: userId,
    }, { transaction: t });

    // 8. Generate Outbox Event atomically inside transaction
    await createOutboxEvent({
      event_type: OUTBOX_EVENT_TYPES.EVENT_RSVP_CHANGED,
      aggregate_type: OUTBOX_AGGREGATE_TYPES.EVENT,
      aggregate_id: eventId,
      payload: {
        eventId,
        userId,
        previousStatus,
        newStatus,
        going_count: newGoingCount,
        interested_count: newInterestedCount,
        declined_count: newDeclinedCount,
        community_id: event.community_id,
      },
    }, { transaction: t });

    // Invalidate Redis caches after transaction commits
    t.afterCommit(async () => {
      await invalidateEventCaches(eventId, event.community_id);
      try {
        eventRsvpTotal.inc({ status: newStatus, transition: `${previousStatus || 'none'}->${newStatus}` });
      } catch (_) {}
    });

    return {
      participant,
      event: {
        id: event.id,
        going_count: newGoingCount,
        interested_count: newInterestedCount,
        declined_count: newDeclinedCount,
      },
      changed: true,
    };
  });
};

export const cancelEventRsvp = async (eventId, userId) => {
  return await sequelize.transaction(async (t) => {
    const event = await Event.findOne({
      where: { id: eventId, is_deleted: false },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (!event) {
      const error = new Error('Event not found');
      error.statusCode = 404;
      throw error;
    }

    const participant = await EventParticipant.findOne({
      where: { event_id: eventId, user_id: userId, is_deleted: false },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (!participant) {
      return { success: true, message: 'No active RSVP found' };
    }

    const previousStatus = participant.status;
    let goingDelta = previousStatus === RSVP_STATUS.GOING ? -1 : 0;
    let interestedDelta = previousStatus === RSVP_STATUS.INTERESTED ? -1 : 0;
    let declinedDelta = previousStatus === RSVP_STATUS.DECLINED ? -1 : 0;

    await participant.update({
      is_deleted: true,
      is_active: false,
      deletedRemarks: 'RSVP removed by user',
      updatedAt: new Date(),
      updated_by: userId,
    }, { transaction: t });

    const newGoing = Math.max(0, Number(event.going_count) + goingDelta);
    const newInterested = Math.max(0, Number(event.interested_count) + interestedDelta);
    const newDeclined = Math.max(0, Number(event.declined_count) + declinedDelta);

    await event.update({
      going_count: newGoing,
      interested_count: newInterested,
      declined_count: newDeclined,
      updatedAt: new Date(),
      updated_by: userId,
    }, { transaction: t });

    // Soft delete chat participant if event chat exists
    const eventChat = await Chat.findOne({
      where: { event_id: eventId, is_deleted: false },
      attributes: ['id'],
      transaction: t,
    });
    if (eventChat) {
      await ChatParticipant.update({
        is_deleted: true,
        is_active: false,
        updatedAt: new Date(),
        updated_by: userId,
      }, {
        where: { chat_id: eventChat.id, user_id: userId },
        transaction: t,
      });
    }

    await createOutboxEvent({
      event_type: OUTBOX_EVENT_TYPES.EVENT_RSVP_CHANGED,
      aggregate_type: OUTBOX_AGGREGATE_TYPES.EVENT,
      aggregate_id: eventId,
      payload: {
        eventId,
        userId,
        previousStatus,
        newStatus: 'cancelled',
        going_count: newGoing,
        interested_count: newInterested,
        declined_count: newDeclined,
        community_id: event.community_id,
      },
    }, { transaction: t });

    t.afterCommit(async () => {
      await invalidateEventCaches(eventId, event.community_id);
      if (eventChat) {
        try {
          await revokeUserFromChatRoom(eventChat.id, userId);
        } catch (_) {}
      }
    });

    return {
      success: true,
      event: {
        id: event.id,
        going_count: newGoing,
        interested_count: newInterested,
        declined_count: newDeclined,
      },
    };
  });
};

export const getEventParticipants = async (eventId, { status, cursor, limit = 20 }) => {
  const where = {
    event_id: eventId,
    is_deleted: false,
    is_active: true,
  };

  if (status) {
    where.status = status;
  }

  if (cursor) {
    where.id = { [Op.lt]: cursor };
  }

  const items = await EventParticipant.findAll({
    where,
    limit: Number(limit) + 1,
    order: [['id', 'DESC']],
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['userId', 'userName', 'email', 'phone'],
      },
    ],
  });

  const hasMore = items.length > Number(limit);
  const results = hasMore ? items.slice(0, Number(limit)) : items;
  const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].id.toString() : null;

  return {
    participants: results,
    nextCursor,
    hasMore,
  };
};

export const getUserRsvps = async (userId, { status, cursor, limit = 20 }) => {
  const where = {
    user_id: userId,
    is_deleted: false,
    is_active: true,
  };

  if (status) {
    where.status = status;
  }

  if (cursor) {
    where.id = { [Op.lt]: cursor };
  }

  const items = await EventParticipant.findAll({
    where,
    limit: Number(limit) + 1,
    order: [['id', 'DESC']],
    include: [
      {
        model: Event,
        as: 'event',
        where: { is_deleted: false },
        include: [
          { model: User, as: 'creator', attributes: ['userId', 'userName', 'email', 'phone'] },
          { model: Community, as: 'community', attributes: ['communityId', 'communityName', 'cover_image'] },
        ],
      },
    ],
  });

  const hasMore = items.length > Number(limit);
  const results = hasMore ? items.slice(0, Number(limit)) : items;
  const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].id.toString() : null;

  return {
    rsvps: results.map((r) => ({
      participantId: r.id,
      status: r.status,
      joined_at: r.joined_at,
      event: r.event,
    })),
    nextCursor,
    hasMore,
  };
};

// Legacy compatibility functions
export const createParticipant = async (data) => setEventRsvp(data.event_id, data.user_id, data.status || 'going');
export const getAllParticipants = async () => EventParticipant.findAll({ where: { is_deleted: false } });
export const getParticipantById = async (id) => EventParticipant.findOne({ where: { id, is_deleted: false } });
export const updateParticipant = async (id, data) => EventParticipant.update(data, { where: { id } });
export const deleteParticipant = async (id) => EventParticipant.update({ is_deleted: true }, { where: { id } });
export const softDeleteParticipant = deleteParticipant;
export const bulkSoftDeleteParticipants = async (ids) => EventParticipant.update({ is_deleted: true }, { where: { id: ids } });
