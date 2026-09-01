import { successResponse, errorResponse } from '../../utils/response.js';
import * as eventParticipantService from './event_participant.service.js';

export const createParticipant = async (req, res, next) => {
  try {
    const { event_id, status } = req.body;
    const userId = req.user?.id || req.body.user_id;
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
    const participants = await eventParticipantService.getAllParticipants();
    return successResponse(res, 200, 'Participants fetched successfully', participants);
  } catch (error) {
    next(error);
  }
};

export const getParticipantById = async (req, res, next) => {
  try {
    const participant = await eventParticipantService.getParticipantById(req.params.id);
    if (!participant) return errorResponse(res, 404, 'Participant not found');
    return successResponse(res, 200, 'Participant fetched successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const updateParticipant = async (req, res, next) => {
  try {
    const participant = await eventParticipantService.updateParticipant(req.params.id, req.body);
    return successResponse(res, 200, 'Participant updated successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const deleteParticipant = async (req, res, next) => {
  try {
    await eventParticipantService.deleteParticipant(req.params.id);
    return successResponse(res, 200, 'Participant deleted successfully', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteParticipants = async (req, res, next) => {
  try {
    const { ids } = req.body;
    const result = await eventParticipantService.bulkSoftDeleteParticipants(ids);
    return successResponse(res, 200, 'Participants deleted successfully', result);
  } catch (error) {
    next(error);
  }
};
