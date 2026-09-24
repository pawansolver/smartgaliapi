import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import EventInvitation, { INVITATION_STATUS } from './event_invitation.model.js';
import Event, { EVENT_STATUS } from '../event/event.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import * as eventParticipantService from '../event_participant/event_participant.service.js';
import { createEvent } from '../outbox/outbox.service.js';

export const sendInvitations = async (eventId, inviterId, inviteeIds, meta = {}) => {
  const event = await Event.findOne({
    where: { id: eventId, is_deleted: false },
  });
  if (!event) {
    const error = new Error('Event not found');
    error.status = 404;
    error.statusCode = 404;
    throw error;
  }

  if (event.status === EVENT_STATUS.CANCELLED) {
    const error = new Error('Cannot invite users to a cancelled event');
    error.status = 400;
    error.statusCode = 400;
    throw error;
  }

  // private event invitation check
  const isCreator = Number(event.created_by) === Number(inviterId);
  const isGlobalAdmin = meta.isGlobalAdmin || meta.userRole === 'admin' || meta.userRole === 'super_admin';
  if (event.visibility === 'private' && !isCreator && !isGlobalAdmin) {
    const error = new Error('Only the event creator or an admin can invite guests to a private event');
    error.status = 403;
    error.statusCode = 403;
    throw error;
  }

  // Deduplicate and filter out self-invites
  const uniqueIds = [...new Set(inviteeIds.map(Number))].filter(id => id !== Number(inviterId));
  if (uniqueIds.length === 0) {
    return { created: 0, invitations: [] };
  }

  const createdInvitations = [];
  const inviter = await User.findByPk(inviterId, {
    attributes: ['userId', 'userName'],
    include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl'] }],
  });
  const inviterName = inviter?.profile?.fullName || inviter?.userName || 'A member';

  for (const targetId of uniqueIds) {
    // Check if invitation already exists (including soft-deleted or non-pending)
    const existing = await EventInvitation.findOne({
      where: {
        event_id: eventId,
        invitee_user_id: targetId,
      },
    });

    if (!existing) {
      try {
        const inv = await EventInvitation.create({
          event_id: eventId,
          inviter_user_id: inviterId,
          invitee_user_id: targetId,
          status: INVITATION_STATUS.PENDING,
          is_active: true,
          is_deleted: false,
          created_by: inviterId,
          created_at: new Date(),
          updatedAt: new Date(),
        });
        createdInvitations.push(inv);

        // Emit outbox event
        await createEvent({
          event_type: 'event.invitation_received',
          aggregate_type: 'event',
          aggregate_id: String(eventId),
          payload: {
            invitationId: Number(inv.id),
            eventId: Number(eventId),
            eventTitle: event.title,
            inviterId: Number(inviterId),
            inviterName,
            inviteeId: Number(targetId),
          },
        }).catch(() => {});
      } catch (err) {
        // Fallback for race-condition duplicate key
        const reloaded = await EventInvitation.findOne({
          where: { event_id: eventId, invitee_user_id: targetId },
        });
        if (reloaded) {
          await reloaded.update({
            inviter_user_id: inviterId,
            status: INVITATION_STATUS.PENDING,
            response_at: null,
            is_active: true,
            is_deleted: false,
            updated_by: inviterId,
            updatedAt: new Date(),
          });
          createdInvitations.push(reloaded);
        }
      }
    } else if (existing.is_deleted || existing.status === INVITATION_STATUS.DECLINED || existing.status === INVITATION_STATUS.CANCELLED) {
      // Re-invitation: reactivate existing record without breaking uix_event_invitee_del
      await existing.update({
        inviter_user_id: inviterId,
        status: INVITATION_STATUS.PENDING,
        response_at: null,
        is_active: true,
        is_deleted: false,
        updated_by: inviterId,
        updatedAt: new Date(),
      });
      createdInvitations.push(existing);

      await createEvent({
        event_type: 'event.invitation_received',
        aggregate_type: 'event',
        aggregate_id: String(eventId),
        payload: {
          invitationId: Number(existing.id),
          eventId: Number(eventId),
          eventTitle: event.title,
          inviterId: Number(inviterId),
          inviterName,
          inviteeId: Number(targetId),
        },
      }).catch(() => {});
    } else {
      // Already active pending or accepted -> skip duplicate invite
    }
  }

  return {
    created: createdInvitations.length,
    invitations: createdInvitations,
  };
};

export const respondToInvitation = async (invitationId, userId, responseStatus) => {
  const invitation = await EventInvitation.findOne({
    where: {
      id: invitationId,
      invitee_user_id: userId,
      is_deleted: false,
    },
    include: [{ model: Event, as: 'event' }],
  });

  if (!invitation) {
    const error = new Error('Invitation not found or unauthorized');
    error.status = 404;
    error.statusCode = 404;
    throw error;
  }

  if (invitation.status !== INVITATION_STATUS.PENDING) {
    const error = new Error(`Invitation has already been ${invitation.status}`);
    error.status = 400;
    error.statusCode = 400;
    throw error;
  }

  const normalizedStatus = responseStatus === 'accepted' ? INVITATION_STATUS.ACCEPTED : INVITATION_STATUS.DECLINED;

  const transaction = await sequelize.transaction();
  try {
    await invitation.update({
      status: normalizedStatus,
      response_at: new Date(),
      updated_by: userId,
      updatedAt: new Date(),
    }, { transaction });

    await transaction.commit();

    // If accepted, synchronize RSVP state to 'going'
    if (normalizedStatus === INVITATION_STATUS.ACCEPTED) {
      await eventParticipantService.setEventRsvp(invitation.event_id, userId, 'going');
    } else if (normalizedStatus === INVITATION_STATUS.DECLINED) {
      // Synchronize RSVP state to declined
      await eventParticipantService.setEventRsvp(invitation.event_id, userId, 'declined').catch(() => {});
    }

    return invitation;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getMyInvitations = async (userId, query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = {
    invitee_user_id: userId,
    is_deleted: false,
  };

  if (query.status && query.status !== 'all') {
    where.status = query.status;
  }

  const { rows, count } = await EventInvitation.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
    include: [
      {
        model: Event,
        as: 'event',
        attributes: ['id', 'title', 'description', 'start_at', 'end_at', 'location', 'location_name', 'cover_image', 'status', 'visibility', 'max_participants', 'going_count', 'interested_count'],
      },
      {
        model: User,
        as: 'inviter',
        attributes: ['userId', 'userName'],
        include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl'] }],
      },
    ],
  });

  return {
    data: rows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };
};

export const getEventInvitations = async (eventId, callerUserId) => {
  return EventInvitation.findAll({
    where: { event_id: eventId, is_deleted: false },
    order: [['created_at', 'DESC']],
    include: [
      {
        model: User,
        as: 'invitee',
        attributes: ['userId', 'userName'],
        include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl'] }],
      },
    ],
  });
};
