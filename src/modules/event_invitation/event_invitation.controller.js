import { successResponse, errorResponse } from '../../utils/response.js';
import * as eventInvitationService from './event_invitation.service.js';

export const sendInvitations = async (req, res, next) => {
  try {
    const inviterId = req.user?.id || req.user?.userId;
    const eventId = req.params.id || req.params.eventId || req.body.eventId || req.body.event_id;
    if (!eventId) {
      const error = new Error('Event ID is required');
      error.statusCode = 400;
      throw error;
    }
    const rawUserIds = req.body.userIds ?? req.body.user_ids ?? [];
    const userIds = Array.isArray(rawUserIds) ? rawUserIds : [rawUserIds];
    const result = await eventInvitationService.sendInvitations(eventId, inviterId, userIds, {
      requestId: req.correlationId,
      ip: req.ip,
      userRole: req.user?.role,
      isGlobalAdmin: req.user?.role === "admin" || req.user?.role === "super_admin",
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, `${result.created} invitations dispatched successfully`, result);
  } catch (error) {
    return next(error);
  }
};

export const respondToInvitation = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const invitationId = req.params.invitationId || req.params.id;
    const status = (req.body.status || '').toLowerCase();
    const invitation = await eventInvitationService.respondToInvitation(invitationId, userId, status);
    return successResponse(res, 200, `Invitation ${status} successfully`, invitation);
  } catch (error) {
    return next(error);
  }
};

export const getMyInvitations = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const result = await eventInvitationService.getMyInvitations(userId, req.query);
    return successResponse(res, 200, 'Invitations retrieved successfully', {
      invitations: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    }, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

export const getEventInvitations = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const eventId = req.params.id || req.params.eventId;
    const invitations = await eventInvitationService.getEventInvitations(eventId, userId);
    return successResponse(res, 200, 'Event invitations retrieved successfully', invitations);
  } catch (error) {
    return next(error);
  }
};
