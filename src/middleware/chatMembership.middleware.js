import ChatParticipant from '../modules/chat_participant/chat_participant.model.js';
import { errorResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';

/**
 * Chat Membership Verification Middleware
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies that the requesting user is an active participant of the chat
 * before allowing access to protected endpoints.
 *
 * Usage:
 *   router.get('/:chatId', verifyChatMember, controller.handler);
 *
 * Expects one of:
 *   - req.params.chatId
 *   - req.body.chat_id
 *   - req.body.chatId
 *
 * And one of:
 *   - req.body.userId
 *   - req.body.sender_id
 *   - req.query.userId
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const verifyChatMember = async (req, res, next) => {
  try {
    const chatId = req.params.chatId || req.params.id || req.body.chat_id || req.body.chatId;
    const userId = req.body.userId   || req.body.sender_id || req.query.userId;

    if (!chatId || !userId) {
      return errorResponse(res, 400, 'chatId and userId are required');
    }

    const participant = await ChatParticipant.findOne({
      where: { chat_id: chatId, user_id: userId, is_deleted: false },
      attributes: ['id', 'role'],
    });

    if (!participant) {
      logger.securityBlock({
        reason: 'chat_membership_denied',
        chatId,
        userId,
        path:   req.path,
      });
      return errorResponse(res, 403, 'You are not a member of this chat');
    }

    // Attach participant info for downstream use
    req.chatParticipant = participant;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Admin-only check — must be used AFTER verifyChatMember.
 */
export const requireChatAdmin = (req, res, next) => {
  if (!req.chatParticipant || req.chatParticipant.role !== 'admin') {
    return errorResponse(res, 403, 'Only chat admins can perform this action');
  }
  next();
};
