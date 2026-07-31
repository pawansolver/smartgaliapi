import { successResponse, errorResponse } from '../../utils/response.js';
import * as messageService from './message.service.js';
import { logger } from '../../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE APIs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/message/send
 * Includes idempotency_key support.
 * If the same key is sent twice, returns the original message (HTTP 200).
 */
export const sendMessage = async (req, res, next) => {
  try {
    const { chat_id } = req.body;
    const sender_id = req.user.id;
    if (!chat_id)   return errorResponse(res, 400, 'chat_id is required');
    if (!sender_id) return errorResponse(res, 400, 'sender_id is required');

    // Attach client IP and UA for audit trail
    req.body._ip = req.ip;
    req.body._ua = req.get('user-agent');

    const result = await messageService.sendMessage(req.body);
    const status = result.idempotent ? 200 : 201;
    const msg    = result.idempotent ? 'Message already sent (idempotent response)' : 'Message sent successfully';
    return successResponse(res, status, msg, result.message);
  } catch (error) {
    logger.error('MESSAGE_CTRL', 'send_failed', { error: error.message });
    next(error);
  }
};

/**
 * GET /api/v1/message/chat/:chatId?cursor=<id>&limit=20&userId=<id>
 */
export const getChatMessages = async (req, res, next) => {
  try {
    const { chatId }              = req.params;
    const { cursor, limit } = req.query;
    const userId = req.user.id;

    const result = await messageService.getChatMessages({
      chatId, requestingUserId: userId, cursor, limit,
    });
    return successResponse(res, 200, 'Messages fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/message/:id/read  — single receipt
 */
export const markMessageRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const message = await messageService.markMessageRead({ messageId: req.params.id, userId });
    return successResponse(res, 200, 'Message marked as read', message);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/message/mark-all-read
 */
export const markAllRead = async (req, res, next) => {
  try {
    const { chatId } = req.body;
    const userId = req.user.id;
    if (!chatId) return errorResponse(res, 400, 'chatId is required');
    const result = await messageService.markAllRead({ chatId, userId });
    return successResponse(res, 200, 'All messages marked as read', result);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/message/:id/react
 */
export const reactToMessage = async (req, res, next) => {
  try {
    const { emoji } = req.body;
    const userId = req.user.id;
    if (!emoji) return errorResponse(res, 400, 'emoji is required');
    const result = await messageService.reactToMessage({ messageId: req.params.id, userId, emoji });
    return successResponse(res, 200, 'Reaction updated', result);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/message/:id/edit
 */
export const editMessage = async (req, res, next) => {
  try {
    const { message } = req.body;
    const userId = req.user.id;
    if (!message) return errorResponse(res, 400, 'message is required');
    const updated = await messageService.editMessage({
      messageId: req.params.id, userId, newText: message,
      ip: req.ip, ua: req.get('user-agent'),
    });
    return successResponse(res, 200, 'Message edited successfully', updated);
  } catch (error) {
    if (error.message.includes('only edit your own')) return errorResponse(res, 403, error.message);
    next(error);
  }
};

/**
 * DELETE /api/v1/message/:id/delete-for-me
 */
export const deleteForMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await messageService.deleteForMe({
      messageId: req.params.id, userId,
      ip: req.ip, ua: req.get('user-agent'),
    });
    return successResponse(res, 200, 'Message deleted for you', result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/message/:id/forward
 */
export const forwardMessage = async (req, res, next) => {
  try {
    const { targetChatId } = req.body;
    const senderId = req.user.id;
    const created_by = req.user.id;
    if (!targetChatId) return errorResponse(res, 400, 'targetChatId is required');
    const message = await messageService.forwardMessage({
      messageId: req.params.id, targetChatId, senderId, created_by,
      ip: req.ip, ua: req.get('user-agent'),
    });
    return successResponse(res, 201, 'Message forwarded successfully', message);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/message/chat/:chatId/search?q=text&limit=30&cursor=id&type=image
 */
export const searchMessages = async (req, res, next) => {
  try {
    const { chatId }                      = req.params;
    const { q, limit, cursor, type }      = req.query;
    if (!q) return errorResponse(res, 400, 'Query param "q" is required');
    const result = await messageService.searchMessages({ chatId, query: q, limit, cursor, messageType: type });
    return successResponse(res, 200, 'Search results', result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/message/chat/:chatId/media?type=image&limit=50
 */
export const getChatMedia = async (req, res, next) => {
  try {
    const { chatId }      = req.params;
    const { type, limit } = req.query;
    const media = await messageService.getChatMedia({ chatId, type, limit });
    return successResponse(res, 200, 'Chat media fetched successfully', media);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/message/:id/receipts  — WhatsApp-style delivery/read info
 */
export const getReceiptSummary = async (req, res, next) => {
  try {
    const result = await messageService.getMessageReceiptSummary(req.params.id);
    return successResponse(res, 200, 'Receipt summary', result);
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY CRUD (backward compatible)
// ─────────────────────────────────────────────────────────────────────────────

export const createMessage = async (req, res, next) => {
  try {
    const message = await messageService.createMessage(req.body);
    return successResponse(res, 201, 'Message created successfully', message);
  } catch (error) {
    next(error);
  }
};

export const getAllMessages = async (req, res, next) => {
  try {
    const messages = await messageService.getAllMessages();
    return successResponse(res, 200, 'Messages fetched successfully', messages);
  } catch (error) {
    next(error);
  }
};

export const getMessageById = async (req, res, next) => {
  try {
    const message = await messageService.getMessageById(req.params.id);
    if (!message) return errorResponse(res, 404, 'Message not found');
    return successResponse(res, 200, 'Message fetched successfully', message);
  } catch (error) {
    next(error);
  }
};

export const updateMessage = async (req, res, next) => {
  try {
    const message = await messageService.updateMessage(req.params.id, req.body);
    if (!message) return errorResponse(res, 404, 'Message not found');
    return successResponse(res, 200, 'Message updated successfully', message);
  } catch (error) {
    next(error);
  }
};

export const deleteMessage = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const message = await messageService.softDeleteMessage(req.params.id, deletedRemarks, updated_by);
    if (!message) return errorResponse(res, 404, 'Message not found');
    return successResponse(res, 200, 'Message deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteMessages = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0)
      return errorResponse(res, 400, 'Please provide an array of ids');
    const result = await messageService.bulkSoftDeleteMessages(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Messages deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
