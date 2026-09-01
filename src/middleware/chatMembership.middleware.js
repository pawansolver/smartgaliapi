import ChatParticipant from '../modules/chat_participant/chat_participant.model.js';
import Chat from '../modules/chat/chat.model.js';
import CommunityMember from '../modules/communityMember/communityMember.model.js';
import Community from '../modules/community/community.model.js';
import { errorResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';

export const verifyChatMember = async (req, res, next) => {
  try {
    const chatId = req.params.chatId || req.params.id || req.body?.chat_id || req.body?.chatId;
    const userId = req.body?.userId || req.body?.sender_id || req.query?.userId || req.user?.id;

    if (!chatId || !userId) {
      return errorResponse(res, 400, 'chatId and userId are required');
    }

    let participant = await ChatParticipant.findOne({
      where: { chat_id: chatId, user_id: userId, is_deleted: false },
      attributes: ['id', 'role'],
    });

    if (!participant) {
      const chat = await Chat.findOne({
        where: { id: chatId, is_deleted: false },
        attributes: ['id', 'chat_type', 'community_id', 'created_by'],
      });
      if (chat && chat.chat_type === 'community') {
        const [comm, communityMembership] = await Promise.all([
          Community.findOne({
            where: { communityId: chat.community_id, status: 'active', is_deleted: false },
            attributes: ['communityId', 'created_by'],
          }),
          CommunityMember.findOne({
            where: {
              community_id: chat.community_id,
              user_id: userId,
              status: 'active',
              is_deleted: false,
            },
            attributes: ['communityMemberId', 'role'],
          }),
        ]);
        if (comm && (communityMembership || Number(comm.created_by) === Number(userId))) {
          const role = (communityMembership?.role === 'admin' || communityMembership?.role === 'moderator' || Number(comm.created_by) === Number(userId)) ? 'admin' : 'member';
          const [newPart] = await ChatParticipant.findOrCreate({
            where: { chat_id: chat.id, user_id: userId },
            defaults: {
              role,
              created_by: chat.created_by || userId,
              is_active: true,
              is_deleted: false,
              joined_at: new Date(),
            },
          });
          await newPart.update({ role, is_active: true, is_deleted: false, updatedAt: new Date() });
          participant = newPart;
        }
      }
    }

    if (!participant) {
      logger.securityBlock({
        reason: 'chat_membership_denied',
        chatId,
        userId,
        path: req.path,
      });
      return errorResponse(res, 403, 'You are not a member of this chat');
    }

    req.chatParticipant = participant;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireChatAdmin = (req, res, next) => {
  if (!req.chatParticipant || req.chatParticipant.role !== 'admin') {
    return errorResponse(res, 403, 'Only chat admins can perform this action');
  }
  next();
};
