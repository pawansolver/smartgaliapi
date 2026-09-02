import ChatParticipant from '../modules/chat_participant/chat_participant.model.js';
import Message from '../modules/message/message.model.js';
import Chat from '../modules/chat/chat.model.js';
import CommunityMember from '../modules/communityMember/communityMember.model.js';
import Community from '../modules/community/community.model.js';
import Event from '../modules/event/event.model.js';
import EventParticipant from '../modules/event_participant/event_participant.model.js';
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

    let participant = await ChatParticipant.findOne({
      where: { chat_id: chatId, user_id: req.user.id, is_deleted: false },
      attributes: ['id', 'chat_id', 'user_id', 'role'],
      include: [{
        model: Chat,
        as: 'chat',
        attributes: ['id', 'chat_type', 'community_id'],
        required: false,
      }],
    });

    const isGlobalAdmin = ['admin', 'super_admin'].includes(req.user?.userRole ?? req.user?.role);

    if (!participant) {
      // If user not in chat_participants yet, dynamically check community or event membership
      const chat = await Chat.findOne({
        where: { id: chatId, is_deleted: false },
        attributes: ['id', 'chat_type', 'community_id', 'event_id', 'created_by'],
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
              user_id: req.user.id,
              status: 'active',
              is_deleted: false,
            },
            attributes: ['communityMemberId', 'role'],
          }),
        ]);
        if (comm && (communityMembership || Number(comm.created_by) === Number(req.user.id) || isGlobalAdmin)) {
          const role = (communityMembership?.role === 'admin' || communityMembership?.role === 'moderator' || Number(comm.created_by) === Number(req.user.id) || isGlobalAdmin) ? 'admin' : 'member';
          const [newPart] = await ChatParticipant.findOrCreate({
            where: { chat_id: chat.id, user_id: req.user.id },
            defaults: {
              role,
              created_by: chat.created_by || req.user.id,
              is_active: true,
              is_deleted: false,
              joined_at: new Date(),
            },
          });
          await newPart.update({ role, is_active: true, is_deleted: false, updatedAt: new Date() });
          participant = newPart;
          participant.chat = chat;
        }
      } else if (chat && chat.chat_type === 'event') {
        const event = await Event.findOne({
          where: { id: chat.event_id, is_deleted: false },
          attributes: ['id', 'created_by', 'community_id', 'status'],
        });
        if (isGlobalAdmin || (event && event.status !== 'cancelled')) {
          const isCreator = event && Number(event.created_by) === Number(req.user.id);
          const eventPart = event ? await EventParticipant.findOne({
            where: {
              event_id: chat.event_id,
              user_id: req.user.id,
              status: ['going', 'interested'],
              is_deleted: false,
              is_active: true,
            },
            attributes: ['id', 'status'],
          }) : null;
          if (isCreator || isGlobalAdmin || eventPart) {
            const role = (isCreator || isGlobalAdmin) ? 'admin' : 'member';
            const [newPart] = await ChatParticipant.findOrCreate({
              where: { chat_id: chat.id, user_id: req.user.id },
              defaults: {
                role,
                created_by: chat.created_by || req.user.id,
                is_active: true,
                is_deleted: false,
                joined_at: new Date(),
              },
            });
            await newPart.update({ role, is_active: true, is_deleted: false, updatedAt: new Date() });
            participant = newPart;
            participant.chat = chat;
          }
        }
      }
    }

    if (!participant) return errorResponse(res, 403, 'You are not a member of this chat');

    // Reload full chat object if missing attributes
    const chat = participant.chat || await Chat.findOne({
      where: { id: chatId, is_deleted: false },
      attributes: ['id', 'chat_type', 'community_id', 'event_id', 'created_by'],
    });

    if (chat?.chat_type === 'community') {
      const [community, communityMembership] = await Promise.all([
        Community.findOne({
          where: { communityId: chat.community_id, status: 'active', is_deleted: false },
          attributes: ['communityId', 'created_by'],
        }),
        CommunityMember.findOne({
          where: {
            community_id: chat.community_id,
            user_id: req.user.id,
            status: 'active',
            is_deleted: false,
          },
          attributes: ['communityMemberId', 'role'],
        }),
      ]);
      const isOwner = community && Number(community.created_by) === Number(req.user.id);
      if (!isGlobalAdmin && (!community || (!communityMembership && !isOwner))) {
        return errorResponse(res, 403, 'Active community membership is required for this chat');
      }
      req.communityMembership = communityMembership || { role: 'admin', status: 'active' };
    } else if (chat?.chat_type === 'event' && !isGlobalAdmin) {
      const event = await Event.findOne({
        where: { id: chat.event_id, is_deleted: false },
        attributes: ['id', 'created_by', 'community_id', 'status'],
      });
      if (!event || event.status === 'cancelled') {
        return errorResponse(res, 403, 'Event is cancelled or no longer active');
      }
      const isCreator = Number(event.created_by) === Number(req.user.id);
      if (!isCreator) {
        const eventParticipant = await EventParticipant.findOne({
          where: {
            event_id: chat.event_id,
            user_id: req.user.id,
            status: ['going', 'interested'],
            is_deleted: false,
            is_active: true,
          },
          attributes: ['id', 'status'],
        });
        if (!eventParticipant) {
          return errorResponse(res, 403, 'Active RSVP is required to participate in this event chat');
        }
      }
    }

    req.chatParticipant = participant;
    req.authorizedChatId = chatId;
    return next();
  } catch (error) {
    return next(error);
  }
};

export const verifyTargetChatMember = (chatIdExtractor = (req) => req.body?.targetChatId) =>
  async (req, res, next) => {
    try {
      const targetChatId = chatIdExtractor(req);
      if (!targetChatId) return errorResponse(res, 400, 'targetChatId is required');

      let participant = await ChatParticipant.findOne({
        where: { chat_id: targetChatId, user_id: req.user.id, is_deleted: false },
        attributes: ['id'],
      });
      if (!participant) {
        const chat = await Chat.findOne({
          where: { id: targetChatId, is_deleted: false },
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
                user_id: req.user.id,
                status: 'active',
                is_deleted: false,
              },
              attributes: ['communityMemberId', 'role'],
            }),
          ]);
          if (comm && (communityMembership || Number(comm.created_by) === Number(req.user.id))) {
            const role = (communityMembership?.role === 'admin' || communityMembership?.role === 'moderator' || Number(comm.created_by) === Number(req.user.id)) ? 'admin' : 'member';
            participant = await ChatParticipant.create({
              chat_id: chat.id,
              user_id: req.user.id,
              role,
              created_by: chat.created_by || req.user.id,
              is_active: true,
              is_deleted: false,
              joined_at: new Date(),
            });
          }
        }
      }
      if (!participant) return errorResponse(res, 403, 'You are not a member of the target chat');
      return next();
    } catch (error) {
      return next(error);
    }
  };

export const verifyMessageMember = async (req, res, next) => {
  try {
    const messageId = req.params.messageId ?? req.params.id;
    if (!messageId) return errorResponse(res, 400, 'messageId is required');

    const message = await Message.findOne({
      where: { id: messageId, is_deleted: false },
      attributes: ['id', 'chat_id', 'sender_id'],
    });
    if (!message) return errorResponse(res, 404, 'Message not found');

    const participant = await ChatParticipant.findOne({
      where: { chat_id: message.chat_id, user_id: req.user.id, is_deleted: false },
      attributes: ['id', 'chat_id', 'user_id', 'role'],
    });
    if (!participant) return errorResponse(res, 403, 'You are not a member of this chat');

    req.targetMessage = message;
    req.chatParticipant = participant;
    req.authorizedChatId = message.chat_id;
    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireMessageOwnerOrChatAdmin = (req, res, next) => {
  const messageSender = req.targetMessage?.sender_id ?? req.messageRecord?.sender_id;
  const isSender = messageSender != null && String(messageSender) === String(req.user?.id);
  const isAdmin = req.chatParticipant?.role === 'admin';
  if (!isSender && !isAdmin) {
    return errorResponse(res, 403, 'You must be the message sender or a chat admin to perform this action');
  }
  return next();
};


export const requireChatAdmin = (req, res, next) => {
  if (!req.chatParticipant || req.chatParticipant.role !== 'admin') {
    return errorResponse(res, 403, 'Only chat admins can perform this action');
  }
  return next();
};
