/**
 * Event Business Service Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles Event CRUD, Keyset Pagination, Geo Haversine Discovery,
 * Redis Cache-Aside, and Transactional Outbox integration.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Op, Sequelize } from 'sequelize';
import sequelize from '../../config/db.js';
import Event, { EVENT_STATUS, EVENT_VISIBILITY } from './event.model.js';
import EventCategory from '../event_category/event_category.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import ChatParticipant from '../chat_participant/chat_participant.model.js';
import EventParticipant, { RSVP_STATUS } from '../event_participant/event_participant.model.js';
import User from '../user/user.model.js';
import Community from '../community/community.model.js';
import Chat from '../chat/chat.model.js';
import { getIO } from '../../socket.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import { canReadEvent, canUpdateEvent, canDeleteEvent, canCancelEvent } from './event.policy.js';
import { createEvent as createOutboxEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import {
  getCachedEvent,
  setCachedEvent,
  getCachedCategories,
  setCachedCategories,
  getCachedFeed,
  setCachedFeed,
  invalidateEventCaches,
} from './event.cache.js';
import { eventCreateTotal, eventViewTotal, eventCancelTotal, eventNearbySearchTotal } from '../../monitoring/metrics.js';

export const createEvent = async (eventData, creatorId, user = null) => {
  if (eventData.society_id) {
    const society = await SocietyProfile.findOne({
      where: { id: eventData.society_id, is_deleted: false, is_active: true },
    });
    if (!society) {
      const error = new Error('Society not found');
      error.statusCode = 404;
      throw error;
    }

    const isGlobalAdmin = (user?.role === 'admin' || user?.userRole === 'admin' || user?.role === 'super_admin' || user?.userRole === 'super_admin');
    const isOwner = Number(society.created_by) === Number(creatorId);

    if (!isGlobalAdmin && !isOwner) {
      const membership = await SocietyMember.findOne({
        where: { society_id: eventData.society_id, user_id: creatorId, status: 'approved', is_deleted: false },
      });

      if (!membership || (membership.role !== 'admin' && membership.role !== 'committee')) {
        const error = new Error('Forbidden: Only society admin or committee members can create society events');
        error.statusCode = 403;
        throw error;
      }
    }
  }

  if (eventData.community_id) {
    const community = await Community.findOne({
      where: { communityId: eventData.community_id, is_deleted: false, status: 'active' },
    });
    if (!community) {
      const error = new Error('Community not found');
      error.statusCode = 404;
      throw error;
    }

    const isGlobalAdmin = (user?.role === 'admin' || user?.userRole === 'admin' || user?.role === 'super_admin' || user?.userRole === 'super_admin');
    const isOwner = Number(community.created_by) === Number(creatorId);

    if (!isGlobalAdmin && !isOwner) {
      const membership = await CommunityMember.findOne({
        where: { community_id: eventData.community_id, user_id: creatorId, is_deleted: false },
      });

      if (!membership || membership.status !== 'active') {
        if (membership?.status === 'banned') {
          const error = new Error('Forbidden: You are banned from this community');
          error.statusCode = 403;
          throw error;
        }
        if (membership?.status === 'pending') {
          const error = new Error('Forbidden: Your community membership is pending approval');
          error.statusCode = 403;
          throw error;
        }
        const error = new Error('Forbidden: Active community membership required to create community events');
        error.statusCode = 403;
        throw error;
      }
    }
  }

  return await sequelize.transaction(async (t) => {
    const event = await Event.create({
      ...eventData,
      created_by: creatorId,
      going_count: 1,
      interested_count: 0,
      declined_count: 0,
      is_deleted: false,
      is_active: true,
      created_at: new Date(),
    }, { transaction: t });

    await EventParticipant.create({
      event_id: event.id,
      user_id: creatorId,
      status: RSVP_STATUS.GOING,
      is_deleted: false,
      is_active: true,
      created_by: creatorId,
      joined_at: new Date(),
      created_at: new Date(),
    }, { transaction: t });

    await createOutboxEvent({
      event_type: OUTBOX_EVENT_TYPES.EVENT_CREATED,
      aggregate_type: OUTBOX_AGGREGATE_TYPES.EVENT,
      aggregate_id: event.id,
      payload: {
        eventId: event.id,
        title: event.title,
        community_id: event.community_id,
        creatorId,
        start_at: event.start_at,
        event_type: event.event_type,
        visibility: event.visibility,
      },
    }, { transaction: t });

    t.afterCommit(async () => {
      await invalidateEventCaches(event.id, event.community_id);
      try {
        eventCreateTotal.inc({
          event_type: event.event_type,
          visibility: event.visibility,
          is_community: event.community_id ? 'true' : 'false',
        });
      } catch (_) {}
    });

    return event;
  });
};

export const getUpcomingEvents = async ({
  categoryId,
  eventType,
  communityId,
  societyId,
  society_id,
  search,
  cursor,
  limit = 20,
  user = null,
}) => {
  const where = {
    is_deleted: false,
    status: EVENT_STATUS.PUBLISHED,
  };

  if (categoryId) where.category_id = categoryId;
  if (eventType) where.event_type = eventType;
  if (communityId) where.community_id = communityId;
  const targetSocietyId = societyId || society_id;
  if (targetSocietyId) where.society_id = targetSocietyId;

  if (search && search.trim().length > 0) {
    const term = '%' + search.trim() + '%';
    where[Op.or] = [
      { title: { [Op.like]: term } },
      { description: { [Op.like]: term } },
      { location: { [Op.like]: term } },
      { location_name: { [Op.like]: term } },
    ];
  }

  if (cursor) {
    where.id = { [Op.lt]: cursor };
  }

  const items = await Event.findAll({
    where,
    limit: Number(limit) + 1,
    order: [['start_at', 'ASC'], ['id', 'DESC']],
    include: [
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'email', 'phone'] },
      { model: Community, as: 'community', attributes: ['communityId', 'communityName', 'cover_image'] },
      { model: EventCategory, as: 'category', attributes: ['id', 'name', 'icon'] },
    ],
  });

  const hasMore = items.length > Number(limit);
  const results = hasMore ? items.slice(0, Number(limit)) : items;
  const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].id.toString() : null;

  let enrichedResults = results.map((e) => e.toJSON ? e.toJSON() : e);
  if (user && user.id && enrichedResults.length > 0) {
    const eventIds = enrichedResults.map((e) => e.id);
    const userRsvps = await EventParticipant.findAll({
      where: {
        event_id: eventIds,
        user_id: user.id,
        is_deleted: false,
        is_active: true,
      },
      attributes: ['event_id', 'status'],
    });
    const rsvpMap = new Map();
    userRsvps.forEach((r) => rsvpMap.set(Number(r.event_id), r.status));
    enrichedResults = enrichedResults.map((e) => ({
      ...e,
      myRsvpStatus: rsvpMap.get(Number(e.id)) || null,
    }));
  }

  return {
    events: enrichedResults,
    nextCursor,
    hasMore,
  };
};

export const getNearbyEvents = async ({
  lat,
  lng,
  radiusKm = 50,
  categoryId,
  eventType,
  cursor,
  limit = 20,
  user = null,
}) => {
  try {
    eventNearbySearchTotal.inc();
  } catch (_) {}

  const latitude = Number(lat);
  const longitude = Number(lng);
  const maxDistance = Number(radiusKm);

  // Bounding box prefiltering for MySQL index scan before Haversine trigonometric calculation
  const latDelta = maxDistance / 111.0;
  const lngDelta = maxDistance / (111.0 * Math.max(0.1, Math.cos((latitude * Math.PI) / 180)));
  const minLat = Number((latitude - latDelta).toFixed(6));
  const maxLat = Number((latitude + latDelta).toFixed(6));
  const minLng = Number((longitude - Math.abs(lngDelta)).toFixed(6));
  const maxLng = Number((longitude + Math.abs(lngDelta)).toFixed(6));

  // Haversine formula calculation in kilometers
  const distanceSql = '(' +
    '6371 * acos(' +
      'cos(radians(' + latitude + ')) * cos(radians(Event.latitude)) * ' +
      'cos(radians(Event.longitude) - radians(' + longitude + ')) + ' +
      'sin(radians(' + latitude + ')) * sin(radians(Event.latitude))' +
    ')' +
  ')';

  const where = {
    is_deleted: false,
    status: EVENT_STATUS.PUBLISHED,
    [Op.and]: [
      Sequelize.literal('Event.latitude IS NOT NULL'),
      Sequelize.literal('Event.longitude IS NOT NULL'),
      Sequelize.literal('Event.latitude BETWEEN ' + minLat + ' AND ' + maxLat),
      Sequelize.literal('Event.longitude BETWEEN ' + minLng + ' AND ' + maxLng),
      Sequelize.literal(distanceSql + ' <= ' + maxDistance),
    ],
  };

  if (categoryId) where.category_id = categoryId;
  if (eventType) where.event_type = eventType;

  if (cursor) {
    where.id = { [Op.lt]: cursor };
  }

  const items = await Event.findAll({
    attributes: {
      include: [[Sequelize.literal(distanceSql), 'distance_km']],
    },
    where,
    limit: Number(limit) + 1,
    order: [[Sequelize.literal('distance_km'), 'ASC'], ['start_at', 'ASC']],
    include: [
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'email', 'phone'] },
      { model: Community, as: 'community', attributes: ['communityId', 'communityName', 'cover_image'] },
      { model: EventCategory, as: 'category', attributes: ['id', 'name', 'icon'] },
    ],
  });

  const hasMore = items.length > Number(limit);
  const results = hasMore ? items.slice(0, Number(limit)) : items;
  const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].id.toString() : null;

  let enrichedResults = results.map((e) => {
    const json = e.toJSON ? e.toJSON() : e;
    if (json.distance_km !== undefined) {
      json.distance_km = Number(Number(json.distance_km).toFixed(2));
    }
    return json;
  });

  if (user && user.id && enrichedResults.length > 0) {
    const eventIds = enrichedResults.map((e) => e.id);
    const userRsvps = await EventParticipant.findAll({
      where: {
        event_id: eventIds,
        user_id: user.id,
        is_deleted: false,
        is_active: true,
      },
      attributes: ['event_id', 'status'],
    });
    const rsvpMap = new Map();
    userRsvps.forEach((r) => rsvpMap.set(Number(r.event_id), r.status));
    enrichedResults = enrichedResults.map((e) => ({
      ...e,
      myRsvpStatus: rsvpMap.get(Number(e.id)) || null,
    }));
  }

  return {
    events: enrichedResults,
    nextCursor,
    hasMore,
  };
};

export const getEventById = async (id, user = null) => {
  const cached = await getCachedEvent(id);
  let eventJson = cached;

  if (!eventJson) {
    const event = await Event.findOne({
      where: { id, is_deleted: false },
      include: [
        { model: User, as: 'creator', attributes: ['userId', 'userName', 'email', 'phone'] },
        { model: Community, as: 'community', attributes: ['communityId', 'communityName', 'cover_image', 'is_private'] },
        { model: EventCategory, as: 'category', attributes: ['id', 'name', 'icon'] },
      ],
    });

    if (!event) return null;
    if (!event) return null;
    eventJson = event.toJSON ? event.toJSON() : event;
    if (typeof eventJson.sub_events === 'string') {
      try {
        eventJson.sub_events = JSON.parse(eventJson.sub_events);
      } catch (_) {
        eventJson.sub_events = [];
      }
    }
    await setCachedEvent(id, eventJson);
  }

  try {
    eventViewTotal.inc({ event_type: eventJson.event_type || 'offline' });
  } catch (_) {}

  let communityMembership = null;
  if (eventJson.community_id && user?.id) {
    communityMembership = await CommunityMember.findOne({
      where: { community_id: eventJson.community_id, user_id: user.id, is_deleted: false },
    });
  }

  const authorized = canReadEvent(eventJson, user, communityMembership, eventJson.community);
  if (!authorized) {
    const error = new Error('You do not have permission to view this event');
    error.statusCode = 403;
    throw error;
  }

  if (user && user.id) {
    const participant = await EventParticipant.findOne({
      where: { event_id: id, user_id: user.id, is_deleted: false, is_active: true },
      attributes: ['status', 'joined_at'],
    });
    eventJson.myRsvpStatus = participant ? participant.status : null;
  }

  return eventJson;
};

export const updateEvent = async (id, updateData, user) => {
  const event = await Event.findOne({ where: { id, is_deleted: false } });
  if (!event) return null;

  let communityMembership = null;
  if (event.community_id && user?.id) {
    communityMembership = await CommunityMember.findOne({
      where: { community_id: event.community_id, user_id: user.id, is_deleted: false },
    });
  }

  if (!canUpdateEvent(event, user, communityMembership)) {
    const error = new Error('Unauthorized to update this event');
    error.statusCode = 403;
    throw error;
  }

  const updated = await event.update({
    ...updateData,
    updatedAt: new Date(),
    updated_by: user.id,
  });

  await createOutboxEvent({
    event_type: OUTBOX_EVENT_TYPES.EVENT_UPDATED,
    aggregate_type: OUTBOX_AGGREGATE_TYPES.EVENT,
    aggregate_id: id,
    payload: { eventId: id, updateData, updatedBy: user.id },
  });

  await invalidateEventCaches(id, event.community_id);

  const eventChat = await Chat.findOne({ where: { event_id: id, is_deleted: false } });
  if (eventChat) {
    await ChatParticipant.update({
      is_deleted: true,
      is_active: false,
      updatedAt: new Date(),
      updated_by: user.id,
    }, { where: { chat_id: eventChat.id } });
    try {
      getIO()?.to(`chat:${eventChat.id}`).emit('chat:access-revoked', { chatId: Number(eventChat.id), reason: 'event_deleted' });
    } catch (_) {}
  }

  return updated;
};

export const cancelEvent = async (id, reason, user) => {
  const event = await Event.findOne({ where: { id, is_deleted: false } });
  if (!event) return null;

  let communityMembership = null;
  if (event.community_id && user?.id) {
    communityMembership = await CommunityMember.findOne({
      where: { community_id: event.community_id, user_id: user.id, is_deleted: false },
    });
  }

  if (!canCancelEvent(event, user, communityMembership)) {
    const error = new Error('Unauthorized to cancel this event');
    error.statusCode = 403;
    throw error;
  }

  const updated = await event.update({
    status: EVENT_STATUS.CANCELLED,
    remark: reason || 'Cancelled by organizer',
    updatedAt: new Date(),
    updated_by: user.id,
  });

  await createOutboxEvent({
    event_type: OUTBOX_EVENT_TYPES.EVENT_CANCELLED,
    aggregate_type: OUTBOX_AGGREGATE_TYPES.EVENT,
    aggregate_id: id,
    payload: { eventId: id, reason, cancelledBy: user.id, community_id: event.community_id },
  });

  await invalidateEventCaches(id, event.community_id);
  try {
    eventCancelTotal.inc();
  } catch (_) {}

  const eventChat = await Chat.findOne({ where: { event_id: id, is_deleted: false } });
  if (eventChat) {
    await ChatParticipant.update({
      is_deleted: true,
      is_active: false,
      updatedAt: new Date(),
      updated_by: user.id,
    }, { where: { chat_id: eventChat.id } });
    try {
      getIO()?.to(`chat:${eventChat.id}`).emit('chat:access-revoked', { chatId: Number(eventChat.id), reason: 'event_cancelled' });
    } catch (_) {}
  }

  return updated;
};

export const softDeleteEvent = async (id, deletedRemarks, user) => {
  const event = await Event.findOne({ where: { id, is_deleted: false } });
  if (!event) return null;

  let communityMembership = null;
  if (event.community_id && user?.id) {
    communityMembership = await CommunityMember.findOne({
      where: { community_id: event.community_id, user_id: user.id, is_deleted: false },
    });
  }

  if (!canDeleteEvent(event, user, communityMembership)) {
    const error = new Error('Unauthorized to delete this event');
    error.statusCode = 403;
    throw error;
  }

  const updated = await event.update({
    is_deleted: true,
    deletedRemarks: deletedRemarks || 'Deleted by user',
    updatedAt: new Date(),
    updated_by: user.id,
  });

  await createOutboxEvent({
    event_type: OUTBOX_EVENT_TYPES.EVENT_DELETED,
    aggregate_type: OUTBOX_AGGREGATE_TYPES.EVENT,
    aggregate_id: id,
    payload: { eventId: id, deletedBy: user.id, community_id: event.community_id },
  });

  await invalidateEventCaches(id, event.community_id);
  return updated;
};

export const getEventCategories = async () => {
  const cached = await getCachedCategories();
  if (cached) return cached;

  const categories = await EventCategory.findAll({
    where: { is_deleted: false, is_active: true },
    order: [['name', 'ASC']],
  });

  await setCachedCategories(categories);
  return categories;
};

export const getAllEvents = async () => getUpcomingEvents({ limit: 100 });
export const bulkSoftDeleteEvents = async (ids, deletedRemarks, updated_by) => {
  return await Event.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};

// ── Enterprise Event Chat Lifecycle ───────────────────────────────────────────
export const getOrCreateEventChat = async (eventId, user) => {
  const event = await Event.findOne({
    where: { id: eventId, is_deleted: false },
  });
  if (!event) {
    const error = new Error('Event not found');
    error.statusCode = 404;
    error.status = 404;
    throw error;
  }

  if (event.status === EVENT_STATUS.CANCELLED) {
    const error = new Error('Chat is not available for cancelled events');
    error.statusCode = 400;
    error.status = 400;
    throw error;
  }

  const userId = user?.id || user?.userId;

  // Authorization check: creator, global admin, or active RSVP participant ('going' or 'interested')
  const isCreator = event.created_by && Number(event.created_by) === Number(userId);
  const isGlobalAdmin = ['admin', 'super_admin'].includes(user?.userRole ?? user?.role);
  
  let participant = null;
  if (!isCreator && !isGlobalAdmin) {
    participant = await EventParticipant.findOne({
      where: {
        event_id: eventId,
        user_id: userId,
        status: { [Op.in]: ['going', 'interested'] },
        is_deleted: false,
      },
    });

    if (!participant) {
      const error = new Error('Active RSVP (Going or Interested) is required to access event chat');
      error.statusCode = 403;
    error.status = 403;
      throw error;
    }
  }

  // Idempotent: find existing Chat or create
  let chat = await Chat.findOne({
    where: { event_id: eventId, is_deleted: false },
  });

  if (!chat) {
    chat = await Chat.create({
      chat_type: 'event',
      name: event.title,
      event_id: event.id,
      created_by: event.created_by || userId,
      created_at: new Date(),
    });
  }

  // Ensure current user is registered in ChatParticipant (handles reactivation & unique constraint safety)
  const role = (isCreator || isGlobalAdmin) ? 'admin' : 'member';
  const existingPart = await ChatParticipant.findOne({
    where: { chat_id: chat.id, user_id: userId },
  });

  if (existingPart) {
    if (existingPart.is_deleted || !existingPart.is_active || existingPart.role !== role) {
      await existingPart.update({
        role,
        is_active: true,
        is_deleted: false,
        updatedAt: new Date(),
      });
    }
  } else {
    try {
      await ChatParticipant.create({
        chat_id: chat.id,
        user_id: userId,
        role,
        is_active: true,
        is_deleted: false,
        joined_at: new Date(),
        created_at: new Date(),
      });
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        await ChatParticipant.update(
          {
            role,
            is_active: true,
            is_deleted: false,
            updatedAt: new Date(),
          },
          { where: { chat_id: chat.id, user_id: userId } }
        );
      } else {
        throw err;
      }
    }
  }

  return {
    id: Number(chat.id),
    name: chat.name || event.title,
    chat_type: chat.chat_type,
    event_id: Number(chat.event_id),
    created_by: chat.created_by,
  };
};

export const bulkCreateEvents = async (eventsList, creatorId, user = null) => {
  const createdList = [];
  for (const eventData of eventsList) {
    const single = await createEvent(eventData, creatorId, user);
    createdList.push(single);
  }
  return createdList;
};
