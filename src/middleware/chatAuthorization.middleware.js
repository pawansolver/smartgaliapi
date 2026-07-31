import ChatParticipant from '../modules/chat_participant/chat_participant.model.js';
import Message from '../modules/message/message.model.js';
import { errorResponse } from '../utils/response.js';

const authenticatedUserId = (req) => String(req.user?.id ?? '');

export const requireAppAdmin = (req, res, next) => {
  const role = req.user?.userRole ?? req.user?.role;
  if (!['admin', 'super_admin'].includes(role)) {
    return errorResponse(res, 403, 'Administrator access required');
  }
  return next();
};

export const bindAuthenticatedIdentity = (...fields) => (req, res, next) => {
  const userId = authenticatedUserId(req);
  if (!userId) return errorResponse(res, 401, 'Authentication required');

  for (const field of fields) {
    const supplied = req.body?.[field] ?? req.query?.[field];
    if (supplied != null && String(supplied) !== userId) {
      return errorResponse(res, 403, `${field} must match the authenticated user`);
    }
    if (req.body) req.body[field] = req.user.id;
    if (req.query && Object.prototype.hasOwnProperty.call(req.query, field)) req.query[field] = req.user.id;
  }
  return next();
};

export const verifyChatMember = async (req, res, next) => {
  try {
    const chatId = req.params.chatId ?? req.params.id ?? req.body?.chat_id ?? req.body?.chatId;
    if (!chatId) return errorResponse(res, 400, 'chatId is required');

    const participant = await ChatParticipant.findOne({
      where: { chat_id: chatId, user_id: req.user.id, is_deleted: false },
      attributes: ['id', 'chat_id', 'user_id', 'role'],
    });
    if (!participant) return errorResponse(res, 403, 'You are not a member of this chat');
    req.chatParticipant = participant;
    req.authorizedChatId = chatId;
    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireChatAdmin = (req, res, next) => {
  if (req.chatParticipant?.role !== 'admin') {
    return errorResponse(res, 403, 'Only chat admins can perform this action');
  }
  return next();
};

export const requireMessageOwnerOrChatAdmin = (req, res, next) => {
  if (
    String(req.messageRecord?.sender_id) !== authenticatedUserId(req)
    && req.chatParticipant?.role !== 'admin'
  ) {
    return errorResponse(res, 403, 'Only the sender or a chat admin can modify this message');
  }
  return next();
};

export const verifyMessageMember = async (req, res, next) => {
  try {
    const message = await Message.findOne({
      where: { id: req.params.id, is_deleted: false },
      attributes: ['id', 'chat_id', 'sender_id'],
    });
    if (!message) return errorResponse(res, 404, 'Message not found');
    req.messageRecord = message;
    req.params.chatId = String(message.chat_id);
    return verifyChatMember(req, res, next);
  } catch (error) {
    return next(error);
  }
};

export const verifyTargetChatMember = (field = 'targetChatId') => async (req, res, next) => {
  try {
    const chatId = req.body?.[field];
    if (!chatId) return errorResponse(res, 400, `${field} is required`);
    const participant = await ChatParticipant.findOne({
      where: { chat_id: chatId, user_id: req.user.id, is_deleted: false },
      attributes: ['id'],
    });
    if (!participant) return errorResponse(res, 403, 'You are not a member of the target chat');
    return next();
  } catch (error) {
    return next(error);
  }
};
