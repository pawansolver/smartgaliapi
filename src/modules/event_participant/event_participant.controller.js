import { successResponse, errorResponse } from '../../utils/response.js';
import * as eventParticipantService from './event_participant.service.js';
import Event from '../event/event.model.js';
import { isGlobalAdminUser } from '../event/event.policy.js';

export const createParticipant = async (req, res, next) => {
  try {
    const { event_id, status } = req.body;
    if (!event_id) {
      return errorResponse(res, 400, 'event_id is required');
    }
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return errorResponse(res, 401, 'Unauthorized');
    }
    const participant = await eventParticipantService.setEventRsvp(event_id, userId, status || 'going');
    return successResponse(res, 201, 'Participant recorded successfully', participant);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

export const getAllParticipants = async (req, res, next) => {
  try {
    const isGlobalAdmin = isGlobalAdminUser(req.user);
    if (!isGlobalAdmin) {
      return errorResponse(res, 403, 'Forbidden: Admin privilege required to view global participants');
    }
    const participants = await eventParticipantService.getAllParticipants();
    return successResponse(res, 200, 'Participants fetched successfully', participants);
  } catch (error) {
    next(error);
  }
};

export const getParticipantById = async (req, res, next) => {
  try {
    const callerId = req.user?.id || req.user?.userId;
    const participant = await eventParticipantService.getParticipantById(req.params.id);
    if (!participant) return errorResponse(res, 404, 'Participant not found');

    const isGlobalAdmin = isGlobalAdminUser(req.user);
    const isSelf = Number(participant.user_id) === Number(callerId);

    if (!isSelf && !isGlobalAdmin) {
      const event = await Event.findOne({ where: { id: participant.event_id, is_deleted: false } });
      const isOrganizer = event && Number(event.created_by) === Number(callerId);
      if (!isOrganizer) {
        return errorResponse(res, 403, 'Forbidden: Not authorized to view this participant record');
      }
    }

    return successResponse(res, 200, 'Participant fetched successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const updateParticipant = async (req, res, next) => {
  try {
    const callerId = req.user?.id || req.user?.userId;
    const participant = await eventParticipantService.getParticipantById(req.params.id);
    if (!participant) return errorResponse(res, 404, 'Participant not found');

    const isGlobalAdmin = isGlobalAdminUser(req.user);
    const isSelf = Number(participant.user_id) === Number(callerId);

    if (!isSelf && !isGlobalAdmin) {
      return errorResponse(res, 403, 'Forbidden: You cannot modify another user\'s participant record');
    }

    const { status } = req.body;
    const updated = await eventParticipantService.updateParticipant(req.params.id, {
      ...(status ? { status } : {}),
      updated_by: callerId,
      updatedAt: new Date(),
    });
    return successResponse(res, 200, 'Participant updated successfully', updated);
  } catch (error) {
    next(error);
  }
};

export const deleteParticipant = async (req, res, next) => {
  try {
    const callerId = req.user?.id || req.user?.userId;
    const participant = await eventParticipantService.getParticipantById(req.params.id);
    if (!participant) return errorResponse(res, 404, 'Participant not found');

    const isGlobalAdmin = isGlobalAdminUser(req.user);
    const isSelf = Number(participant.user_id) === Number(callerId);

    if (!isSelf && !isGlobalAdmin) {
      const event = await Event.findOne({ where: { id: participant.event_id, is_deleted: false } });
      const isOrganizer = event && Number(event.created_by) === Number(callerId);
      if (!isOrganizer) {
        return errorResponse(res, 403, 'Forbidden: You cannot delete another user\'s participant record');
      }
    }

    await eventParticipantService.deleteParticipant(req.params.id);
    return successResponse(res, 200, 'Participant deleted successfully', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteParticipants = async (req, res, next) => {
  try {
    const callerId = req.user?.id || req.user?.userId;
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'ids array is required');
    }

    const isGlobalAdmin = isGlobalAdminUser(req.user);
    if (!isGlobalAdmin) {
      return errorResponse(res, 403, 'Forbidden: Bulk deletion requires administrative privilege');
    }

    const result = await eventParticipantService.bulkSoftDeleteParticipants(ids);
    return successResponse(res, 200, 'Participants deleted successfully', result);
  } catch (error) {
    next(error);
  }
};
