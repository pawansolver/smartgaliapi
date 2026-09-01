/**
 * Outbox Processor - Enterprise Hardened
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes outbox events to their handlers.
 * Supports Chat, Feed/Post, Community, and Event aggregate domain events.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { logger } from '../../utils/logger.js';
import OutboxEvent from './outbox_event.model.js';
import * as outboxService from './outbox.service.js';
import { OUTBOX_STATUS, OUTBOX_EVENT_TYPES } from './outbox.events.js';
import { emitNotification } from '../notification/notification.service.js';
import Community from '../community/community.model.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';

export const processorDeps = {
  loadOutboxEvent: (id) => OutboxEvent.findByPk(id),
  markProcessing: (...args) => outboxService.markProcessing(...args),
  markPublished: (...args) => outboxService.markPublished(...args),
  markFailed: (...args) => outboxService.markFailed(...args),
  emitNotification: (...args) => emitNotification(...args),
  handleMessageCreatedPush: async (context, payload) => {
    const dispatchChatPush = context.dispatchChatPush;
    if (typeof dispatchChatPush === 'function') {
      await dispatchChatPush(payload);
    }
  },
};

/**
 * message.created: broadcast to chat room and dispatch push notifications.
 */
const handleMessageCreated = async (event, context = {}) => {
  const { messageId, chatId, senderId, senderName, content, messageType } = event.payload || {};

  const io = context.io;
  if (io && chatId) {
    io.to(`chat:${chatId}`).emit('chat:message', {
      messageId,
      chatId,
      senderId,
      senderName,
      content,
      messageType,
      createdAt: event.created_at,
    });
    logger.debug('OUTBOX', 'socket_broadcast_emitted', { chatId, messageId });
  }

  await processorDeps.handleMessageCreatedPush(context, {
    chatId,
    messageId,
    senderId,
    senderName,
    content,
    messageType,
  });
};

/**
 * post.liked: Send in-app notification to post author (if liker != author).
 */
const handlePostLiked = async (event) => {
  const { postId, actorId, authorId } = event.payload || {};
  if (!authorId || Number(actorId) === Number(authorId)) return;

  await processorDeps.emitNotification({
    recipientId: authorId,
    actorId,
    type: 'like',
    title: 'New Like',
    message: 'liked your post.',
    data: { postId, target: 'post' },
    preferenceKey: 'post_likes',
  });
};

/**
 * post.unliked: No notification required.
 */
const handlePostUnliked = async (event) => {
  logger.info('OUTBOX', 'post_unliked_event_processed', { eventId: event.id });
};

/**
 * post.commented: Log the event. Notification sent inline in addComment().
 */
const handlePostCommented = async (event) => {
  const { postId, commentId, userId } = event.payload || {};
  logger.info('OUTBOX', 'post_commented_event_processed', { postId, commentId, userId, eventId: event.id });
};

/**
 * post.created: Log for audit trail.
 */
const handlePostCreated = async (event) => {
  const { postId, authorId, visibility } = event.payload || {};
  logger.info('OUTBOX', 'post_created_event_processed', { postId, authorId, visibility, eventId: event.id });
};

/**
 * post.deleted: Log for audit trail.
 */
const handlePostDeleted = async (event) => {
  const { postId, authorId } = event.payload || {};
  logger.info('OUTBOX', 'post_deleted_event_processed', { postId, authorId, eventId: event.id });
};

/**
 * post.shared: Log for audit trail.
 */
const handlePostShared = async (event) => {
  const { postId, userId } = event.payload || {};
  logger.info('OUTBOX', 'post_shared_event_processed', { postId, userId, eventId: event.id });
};

const handleCommunityEvent = async (event) => {
  const payload = event.payload || {};
  const communityId = payload.communityId;
  const community = communityId
    ? await Community.findOne({ where: { communityId, is_deleted: false }, attributes: ['communityId', 'communityName'] })
    : null;
  const targetId = payload.userId ?? payload.targetUserId;
  const deepLinkData = { communityId: Number(communityId), target: 'community' };

  if (event.event_type === OUTBOX_EVENT_TYPES.COMMUNITY_JOIN_REQUEST) {
    const admins = await CommunityMember.findAll({
      where: { community_id: communityId, role: ['admin', 'moderator'], status: 'active', is_deleted: false },
      attributes: ['user_id'],
    });
    await Promise.all(admins.map((row) => processorDeps.emitNotification({
      recipientId: row.user_id,
      actorId: targetId,
      type: 'info',
      title: 'New community join request',
      message: `A user requested to join ${community?.communityName || 'your community'}.`,
      data: { ...deepLinkData, requestId: payload.requestId, section: 'join-requests' },
      preferenceKey: 'community_chat',
    })));
  } else if (event.event_type === OUTBOX_EVENT_TYPES.COMMUNITY_ANNOUNCEMENT) {
    const members = await CommunityMember.findAll({
      where: { community_id: communityId, status: 'active', is_deleted: false },
      attributes: ['user_id'],
    });
    await Promise.all(members.map((row) => processorDeps.emitNotification({
      recipientId: row.user_id,
      actorId: payload.userId ?? payload.createdBy,
      type: 'alert',
      title: payload.title || `Announcement in ${community?.communityName || 'community'}`,
      message: payload.message || 'A new community announcement was posted.',
      data: { ...deepLinkData, announcementId: payload.announcementId, section: 'announcements' },
      preferenceKey: 'community_chat',
    })));
  } else if (targetId) {
    const messages = {
      [OUTBOX_EVENT_TYPES.COMMUNITY_JOIN_APPROVED]: 'Your community join request was approved.',
      [OUTBOX_EVENT_TYPES.COMMUNITY_JOIN_REJECTED]: 'Your community join request was declined.',
      [OUTBOX_EVENT_TYPES.COMMUNITY_MEMBER_REMOVED]: 'You were removed from the community.',
      [OUTBOX_EVENT_TYPES.COMMUNITY_MEMBER_BANNED]: 'You were banned from the community.',
      [OUTBOX_EVENT_TYPES.COMMUNITY_ROLE_CHANGED]: `Your community role changed to ${payload.newRole}.`,
      [OUTBOX_EVENT_TYPES.COMMUNITY_INVITED]: `You were invited to ${community?.communityName || 'a community'}.`,
    };
    if (messages[event.event_type]) {
      await processorDeps.emitNotification({
        recipientId: targetId,
        actorId: payload.actorUserId,
        type: 'info',
        title: community?.communityName || 'Community update',
        message: messages[event.event_type],
        data: {
          ...deepLinkData,
          ...(payload.invitationId ? { invitationId: Number(payload.invitationId) } : {}),
        },
        preferenceKey: 'community_chat',
      });
    }
  }
  logger.info('OUTBOX', 'community_event_processed', { eventId: event.id, eventType: event.event_type, communityId });
};

// ── Event Domain Handlers ────────────────────────────────────────
const handleEventCreated = async (outboxEvent, context = {}) => {
  const payload = outboxEvent.payload || {};
  const { eventId, community_id, title } = payload;
  logger.info('OUTBOX', 'event_created_processed', { eventId, community_id, title });

  const io = context.io;
  if (io) {
    if (community_id) {
      io.to(`community:${community_id}`).emit('event:created', payload);
    } else {
      io.emit('event:created', payload);
    }
  }
};

const handleEventUpdated = async (outboxEvent, context = {}) => {
  const payload = outboxEvent.payload || {};
  const { eventId, community_id } = payload;
  logger.info('OUTBOX', 'event_updated_processed', { eventId, community_id });

  const io = context.io;
  if (io) {
    io.to(`event:${eventId}`).emit('event:updated', payload);
    if (community_id) io.to(`community:${community_id}`).emit('event:updated', payload);
  }
};

const handleEventCancelled = async (outboxEvent, context = {}) => {
  const payload = outboxEvent.payload || {};
  const { eventId, community_id, reason } = payload;
  logger.info('OUTBOX', 'event_cancelled_processed', { eventId, community_id, reason });

  const io = context.io;
  if (io) {
    io.to(`event:${eventId}`).emit('event:cancelled', payload);
    if (community_id) io.to(`community:${community_id}`).emit('event:cancelled', payload);
  }
};

const handleEventDeleted = async (outboxEvent, context = {}) => {
  const payload = outboxEvent.payload || {};
  const { eventId, community_id } = payload;
  logger.info('OUTBOX', 'event_deleted_processed', { eventId, community_id });

  const io = context.io;
  if (io) {
    io.to(`event:${eventId}`).emit('event:deleted', payload);
    if (community_id) io.to(`community:${community_id}`).emit('event:deleted', payload);
  }
};

const handleEventRsvpChanged = async (outboxEvent, context = {}) => {
  const payload = outboxEvent.payload || {};
  const { eventId, userId, newStatus, going_count, interested_count, declined_count } = payload;
  logger.info('OUTBOX', 'event_rsvp_changed_processed', { eventId, userId, newStatus, going_count });

  const io = context.io;
  if (io) {
    io.to(`event:${eventId}`).emit('event:rsvp_updated', payload);
    io.to(`event:${eventId}`).emit('event:participant_count_updated', {
      eventId,
      going_count,
      interested_count,
      declined_count,
    });
  }
};

const handleEventReminderRequired = async (outboxEvent) => {
  const payload = outboxEvent.payload || {};
  logger.info('OUTBOX', 'event_reminder_dispatched', { payload });
};


// ── Society Domain Handler ───────────────────────────────────────
const handleSocietyEvent = async (event, context = {}) => {
  const payload = event.payload || {};
  const societyId = payload.societyId;
  const io = context.io;

  if (io && societyId) {
    io.to(`society:${societyId}`).emit(event.event_type, payload);
  }

  // 1. Visitor Arrived -> Notify Host Resident
  if (event.event_type === 'society.visitor_arrived' && payload.hostUserId) {
    if (io) {
      io.to(`user:${payload.hostUserId}`).emit('society:visitor_arrived', payload);
    }
    await processorDeps.emitNotification({
      recipientId: payload.hostUserId,
      actorId: payload.updatedBy,
      type: 'alert',
      title: 'Visitor at Gate',
      message: `${payload.visitorName || 'A visitor'} has arrived at the gate for flat ${payload.flatNo || ''}.`,
      data: { societyId: Number(societyId), visitorId: payload.visitorId, target: 'society_visitor' },
      preferenceKey: 'visitor_alerts',
    });
  }

  // 2. Announcement Created -> Notify Society Members
  if (event.event_type === 'society.announcement_created') {
    const members = await SocietyMember.findAll({
      where: { society_id: societyId, status: 'active', is_deleted: false },
      attributes: ['user_id'],
    });
    await Promise.all(members.map((row) => processorDeps.emitNotification({
      recipientId: row.user_id,
      actorId: payload.createdBy,
      type: 'alert',
      title: payload.title || 'New Society Announcement',
      message: payload.message || 'A new circular has been published.',
      data: { societyId: Number(societyId), announcementId: payload.announcementId, target: 'society_announcement' },
      preferenceKey: 'society_announcements',
    })));
  }

  // 3. Complaint Status Changed -> Notify Creator Resident
  if (event.event_type === 'society.complaint_status_changed' && payload.creatorUserId) {
    if (io) {
      io.to(`user:${payload.creatorUserId}`).emit('society:complaint_updated', payload);
    }
    await processorDeps.emitNotification({
      recipientId: payload.creatorUserId,
      actorId: payload.updatedBy,
      type: 'info',
      title: 'Complaint Status Updated',
      message: `Your complaint #${payload.complaintId} status changed to ${payload.status}.`,
      data: { societyId: Number(societyId), complaintId: payload.complaintId, target: 'society_complaint' },
      preferenceKey: 'complaint_updates',
    });
  }

  // 4. Poll Created -> Notify Members
  if (event.event_type === 'society.poll_created') {
    const members = await SocietyMember.findAll({
      where: { society_id: societyId, status: 'active', is_deleted: false },
      attributes: ['user_id'],
    });
    await Promise.all(members.map((row) => processorDeps.emitNotification({
      recipientId: row.user_id,
      actorId: payload.createdBy,
      type: 'info',
      title: 'New Society Poll',
      message: payload.question || 'A new poll is open for voting.',
      data: { societyId: Number(societyId), pollId: payload.pollId, target: 'society_poll' },
      preferenceKey: 'society_announcements',
    })));
  }

  logger.info('OUTBOX', 'society_event_processed', { eventId: event.id, eventType: event.event_type, societyId });
};

// ── Handler Registry ─────────────────────────────────────────────
const handlers = {
  [OUTBOX_EVENT_TYPES.MESSAGE_CREATED]: handleMessageCreated,
  [OUTBOX_EVENT_TYPES.POST_CREATED]:    handlePostCreated,
  [OUTBOX_EVENT_TYPES.POST_DELETED]:    handlePostDeleted,
  [OUTBOX_EVENT_TYPES.POST_LIKED]:      handlePostLiked,
  [OUTBOX_EVENT_TYPES.POST_UNLIKED]:    handlePostUnliked,
  [OUTBOX_EVENT_TYPES.POST_COMMENTED]:  handlePostCommented,
  [OUTBOX_EVENT_TYPES.POST_SHARED]:     handlePostShared,
  [OUTBOX_EVENT_TYPES.COMMUNITY_CREATED]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_UPDATED]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_DELETED]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_MEMBER_JOINED]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_MEMBER_LEFT]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_JOIN_REQUEST]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_JOIN_APPROVED]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_JOIN_REJECTED]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_MEMBER_REMOVED]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_MEMBER_BANNED]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_ROLE_CHANGED]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_ANNOUNCEMENT]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_POLL_CREATED]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.COMMUNITY_INVITED]: handleCommunityEvent,
  [OUTBOX_EVENT_TYPES.EVENT_CREATED]: handleEventCreated,
  [OUTBOX_EVENT_TYPES.EVENT_UPDATED]: handleEventUpdated,
  [OUTBOX_EVENT_TYPES.EVENT_CANCELLED]: handleEventCancelled,
  [OUTBOX_EVENT_TYPES.EVENT_DELETED]: handleEventDeleted,
  [OUTBOX_EVENT_TYPES.EVENT_RSVP_CHANGED]: handleEventRsvpChanged,
  [OUTBOX_EVENT_TYPES.EVENT_REMINDER_REQUIRED]: handleEventReminderRequired,
  [OUTBOX_EVENT_TYPES.SOCIETY_CREATED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_UPDATED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_DELETED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_MEMBER_JOINED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_MEMBER_APPROVED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_MEMBER_REJECTED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_MEMBER_REMOVED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_ROLE_CHANGED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_OWNERSHIP_TRANSFERRED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_ANNOUNCEMENT_CREATED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_COMPLAINT_CREATED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_COMPLAINT_STATUS_CHANGED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_VISITOR_CREATED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_VISITOR_ARRIVED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_VISITOR_APPROVED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_VISITOR_DENIED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_VISITOR_CHECKED_IN]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_VISITOR_CHECKED_OUT]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_PARKING_ALLOCATED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_POLL_CREATED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_POLL_VOTED]: handleSocietyEvent,
  [OUTBOX_EVENT_TYPES.SOCIETY_POLL_CLOSED]: handleSocietyEvent,
  'society.created': handleSocietyEvent,
  'society.updated': handleSocietyEvent,
  'society.deleted': handleSocietyEvent,
  'society.member_joined': handleSocietyEvent,
  'society.member_approved': handleSocietyEvent,
  'society.member_rejected': handleSocietyEvent,
  'society.member_removed': handleSocietyEvent,
  'society.role_changed': handleSocietyEvent,
  'society.ownership_transferred': handleSocietyEvent,
  'society.announcement_created': handleSocietyEvent,
  'society.complaint_created': handleSocietyEvent,
  'society.complaint_status_changed': handleSocietyEvent,
  'society.visitor_created': handleSocietyEvent,
  'society.visitor_arrived': handleSocietyEvent,
  'society.visitor_approved': handleSocietyEvent,
  'society.visitor_denied': handleSocietyEvent,
  'society.visitor_checked_in': handleSocietyEvent,
  'society.visitor_checked_out': handleSocietyEvent,
  'society.parking_allocated': handleSocietyEvent,
  'society.poll_created': handleSocietyEvent,
  'society.poll_voted': handleSocietyEvent,
  'society.poll_closed': handleSocietyEvent,

};

/**
 * Process a single outbox event.
 * At-least-once delivery: already-published events are skipped.
 */
export const processEvent = async (event, context = {}) => {
  if (!event?.id) {
    logger.warn('OUTBOX', 'invalid_event', { reason: 'missing_id' });
    return { ok: false, reason: 'invalid_event' };
  }

  const fresh = await processorDeps.loadOutboxEvent(event.id);
  if (!fresh) {
    logger.warn('OUTBOX', 'invalid_event', { eventId: event.id, reason: 'not_found' });
    return { ok: false, reason: 'not_found' };
  }

  if (fresh.status === OUTBOX_STATUS.PUBLISHED) {
    return { ok: true, reason: 'already_published' };
  }

  const eventType = fresh.event_type;
  const handler = handlers[eventType];

  if (!handler) {
    logger.warn('OUTBOX', 'invalid_event', { eventId: fresh.id, eventType, reason: 'unknown_event_type' });
    await processorDeps.markFailed(fresh.id, `Unknown event_type: ${eventType}`);
    return { ok: false, reason: 'unknown_event_type' };
  }

  try {
    await processorDeps.markProcessing(fresh.id);
    await handler(fresh, context);
    await processorDeps.markPublished(fresh.id);
    return { ok: true };
  } catch (error) {
    logger.error('OUTBOX', 'outbox_event_processing_failure', {
      eventId: fresh.id,
      eventType,
      error: error.message,
    });
    await processorDeps.markFailed(fresh.id, error).catch((markErr) => {
      logger.error('OUTBOX', 'outbox_mark_failed_error', { eventId: fresh.id, error: markErr.message });
    });
    return { ok: false, reason: 'processing_failed', error: error.message };
  }
};

export default { processEvent, processorDeps };
