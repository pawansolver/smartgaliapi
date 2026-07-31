import { successResponse, errorResponse } from '../../utils/response.js';
import * as eventParticipantService from './event_participant.service.js';

export const createParticipant = async (req, res, next) => {
  try {
    const participant = await eventParticipantService.createParticipant(req.body);
    return successResponse(res, 201, 'Event participant created successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const getAllParticipants = async (req, res, next) => {
  try {
    const participants = await eventParticipantService.getAllParticipants();
    return successResponse(res, 200, 'Event participants fetched successfully', participants);
  } catch (error) {
    next(error);
  }
};

export const getParticipantById = async (req, res, next) => {
  try {
    const participant = await eventParticipantService.getParticipantById(req.params.id);
    if (!participant) {
      return errorResponse(res, 404, 'Event participant not found');
    }
    return successResponse(res, 200, 'Event participant fetched successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const updateParticipant = async (req, res, next) => {
  try {
    const participant = await eventParticipantService.updateParticipant(req.params.id, req.body);
    if (!participant) {
      return errorResponse(res, 404, 'Event participant not found');
    }
    return successResponse(res, 200, 'Event participant updated successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const deleteParticipant = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const participant = await eventParticipantService.softDeleteParticipant(req.params.id, deletedRemarks, updated_by);
    if (!participant) {
      return errorResponse(res, 404, 'Event participant not found');
    }
    return successResponse(res, 200, 'Event participant deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteParticipants = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await eventParticipantService.bulkSoftDeleteParticipants(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Event participants deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
