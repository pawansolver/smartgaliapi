import { successResponse, errorResponse } from '../../utils/response.js';
import * as chatParticipantService from './chat_participant.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE APIs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/chat-participant/:chatId/members
 * Returns all active members of a chat with online status.
 */
export const getChatMembers = async (req, res, next) => {
  try {
    const members = await chatParticipantService.getChatMembers(req.params.chatId);
    return successResponse(res, 200, 'Chat members fetched successfully', members);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/chat-participant/:chatId/add
 * Body: { userIds: [], addedBy }
 * Bulk-adds participants to a group chat (transaction-safe).
 */
export const addParticipants = async (req, res, next) => {
  try {
    const { userIds } = req.body;
    const addedBy = req.user.id;
    if (!Array.isArray(userIds) || userIds.length === 0)
      return errorResponse(res, 400, 'userIds must be a non-empty array');
    if (!addedBy)
      return errorResponse(res, 400, 'addedBy is required');
    const result = await chatParticipantService.addParticipants({
      chatId: req.params.chatId, userIds, addedBy,
    });
    return successResponse(res, 201, 'Participants added successfully', result);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/chat-participant/:chatId/remove/:userId
 * Body: { removedBy }
 */
export const removeMember = async (req, res, next) => {
  try {
    const { chatId, userId } = req.params;
    const removedBy = req.user.id;
    await chatParticipantService.removeMember({ chatId, userId, removedBy });
    return successResponse(res, 200, 'Member removed from chat', null);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/chat-participant/:chatId/make-admin/:userId
 * Body: { promotedBy }
 */
export const makeAdmin = async (req, res, next) => {
  try {
    const { chatId, userId } = req.params;
    const promotedBy = req.user.id;
    const result = await chatParticipantService.makeAdmin({ chatId, userId, promotedBy });
    return successResponse(res, 200, 'Member promoted to admin', result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/chat-participant/:chatId/leave
 * Body: { userId }
 * Auto-promotes next member if leaving user was the only admin.
 */
export const leaveChat = async (req, res, next) => {
  try {
    const userId = req.user.id;
    await chatParticipantService.leaveChat({ chatId: req.params.chatId, userId });
    return successResponse(res, 200, 'You have left the chat', null);
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY CRUD (backward compatible)
// ─────────────────────────────────────────────────────────────────────────────

export const createParticipant = async (req, res, next) => {
  try {
    const participant = await chatParticipantService.createParticipant(req.body);
    return successResponse(res, 201, 'Chat participant created successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const getAllParticipants = async (req, res, next) => {
  try {
    const participants = await chatParticipantService.getAllParticipants();
    return successResponse(res, 200, 'Chat participants fetched successfully', participants);
  } catch (error) {
    next(error);
  }
};

export const getParticipantById = async (req, res, next) => {
  try {
    const participant = await chatParticipantService.getParticipantById(req.params.id);
    if (!participant) return errorResponse(res, 404, 'Chat participant not found');
    return successResponse(res, 200, 'Chat participant fetched successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const updateParticipant = async (req, res, next) => {
  try {
    const participant = await chatParticipantService.updateParticipant(req.params.id, req.body);
    if (!participant) return errorResponse(res, 404, 'Chat participant not found');
    return successResponse(res, 200, 'Chat participant updated successfully', participant);
  } catch (error) {
    next(error);
  }
};

export const deleteParticipant = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const participant = await chatParticipantService.softDeleteParticipant(req.params.id, deletedRemarks, updated_by);
    if (!participant) return errorResponse(res, 404, 'Chat participant not found');
    return successResponse(res, 200, 'Chat participant deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteParticipants = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0)
      return errorResponse(res, 400, 'Please provide an array of ids');
    const result = await chatParticipantService.bulkSoftDeleteParticipants(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Chat participants deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
