import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import User from './modules/user/user.model.js';
import ChatParticipant from './modules/chat_participant/chat_participant.model.js';
import Chat from './modules/chat/chat.model.js';
import CommunityMember from './modules/communityMember/communityMember.model.js';
import SocietyProfile from './modules/society_profile/society_profile.model.js';
import SocietyMember from './modules/society_member/society_member.model.js';
import Community from './modules/community/community.model.js';
import Message from './modules/message/message.model.js';
import { markDelivered, markRead } from './modules/message_receipt/message_receipt.service.js';
import { getPubClient, getSubClient, getIsRedisAvailable } from './config/redis.js';
import env from './config/env.js';
import { logger } from './utils/logger.js';
import { normalizeMediaPayload } from './utils/mediaUrl.js';
import {
  socketConnectionsActive,
  socketConnectionsTotal,
  socketDisconnectionsTotal,
  socketConnectionErrors,
  presenceUpdatesTotal,
} from './monitoring/metrics.js';
import {
  markUserOnline,
  touchUserPresence,
  handleUserSocketDisconnect,
  PRESENCE_TTL_SECONDS,
} from './infrastructure/presence/presence.js';

const PRESENCE_HEARTBEAT_MS = 60_000;
const userSocketsMap = new Map();
let _io = null;

export const getIO = () => _io;

export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 25000,
  });

  _io = io;

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearers+/i, '');

      if (!token) {
        socketConnectionErrors.inc();
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, env.JWT_SECRET);
      const user = await User.findOne({
        where: { userId: decoded.id, is_active: true, is_deleted: false },
        attributes: ['userId', 'userName', 'status'],
      });

      if (!user) {
        socketConnectionErrors.inc();
        return next(new Error('User not found or inactive'));
      }

      socket.userId = user.userId;
      socket.user = user;
      return next();
    } catch (error) {
      socketConnectionErrors.inc();
      return next(new Error(error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.userId;
    logger.socketConnect({ socketId: socket.id, userId: uid });
    socketConnectionsTotal.inc();
    socketConnectionsActive.inc();

    if (!userSocketsMap.has(uid)) userSocketsMap.set(uid, new Set());
    userSocketsMap.get(uid).add(socket.id);
    socket.join(`user:${uid}`);

    const presenceReady = markUserOnline(uid)
      .then((becameOnline) => {
        if (becameOnline) {
          presenceUpdatesTotal.inc({ type: 'online' });
          socket.broadcast.emit('presence:online', { userId: uid });
        }
      })
      .catch((err) => logger.error('SOCKET', 'presence_online_failed', { userId: uid, error: err.message }));

    const heartbeat = setInterval(() => {
      touchUserPresence(uid).catch(() => {});
    }, PRESENCE_HEARTBEAT_MS);
    if (typeof heartbeat.unref === 'function') heartbeat.unref();

    socket.on('user:online', (_payload = {}, acknowledge) => {
      touchUserPresence(uid).catch(() => {});
      if (typeof acknowledge === 'function') {
        acknowledge({ ok: true, userId: uid });
      }
    });

    socket.on('presence:ping', (_payload = {}, acknowledge) => {
      touchUserPresence(uid).catch(() => {});
      if (typeof acknowledge === 'function') acknowledge({ ok: true, userId: uid });
    });

    socket.on('chat:typing', ({ chatId, isTyping } = {}) => {
      if (!chatId || !socket.rooms.has(`chat:${chatId}`)) return;
      socket.to(`chat:${chatId}`).emit('chat:typing', { 
        chatId, 
        userId: socket.userId, 
        isTyping 
      });
    });

    // ── user:join:chat ────────────────────────────────────────────────────────
    socket.on('user:join:chat', async ({ chatId } = {}, acknowledge) => {
      if (!chatId) return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'chatId is required' });
      try {
        const membership = await ChatParticipant.findOne({
          where: { chat_id: chatId, user_id: uid, is_deleted: false },
          attributes: ['id'],
        });
        if (!membership) {
          return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'Not a chat member' });
        }
        const chat = await Chat.findOne({
          where: { id: chatId, is_deleted: false },
          attributes: ['chat_type', 'community_id'],
        });
        if (!chat) {
          return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'Chat not found' });
        }
        if (chat.chat_type === 'community') {
          const [activeCommunity, activeCommunityMember] = await Promise.all([
            Community.findOne({
              where: {
                communityId: chat.community_id,
                status: 'active',
                is_deleted: false,
              },
              attributes: ['communityId'],
            }),
            CommunityMember.findOne({
              where: {
                community_id: chat.community_id,
                user_id: uid,
                status: 'active',
                is_deleted: false,
              },
              attributes: ['communityMemberId'],
            }),
          ]);
          if (!activeCommunity || !activeCommunityMember) {
            return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'Active community membership required' });
          }
        }
        await socket.join(`chat:${chatId}`);
        if (typeof acknowledge === 'function') acknowledge({ ok: true, chatId });
      } catch (error) {
        logger.error('SOCKET', 'join_chat_failed', { chatId, userId: uid, error: error.message });
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Unable to join chat' });
      }
    });

    socket.on('user:leave:chat', ({ chatId }) => {
      if (!chatId) return;
      socket.leave(`chat:${chatId}`);
    });

    // ── user:join:community (Phase 12) ────────────────────────────────────────
    socket.on('user:join:community', async ({ communityId } = {}, acknowledge) => {
      if (!communityId) return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'communityId is required' });
      try {
        const community = await Community.findOne({
          where: { communityId, status: 'active', is_deleted: false },
        });
        if (!community) {
          return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'Community not found' });
        }

        if (community.is_private) {
          const membership = await CommunityMember.findOne({
            where: { community_id: communityId, user_id: uid, status: 'active', is_deleted: false },
          });
          if (!membership && Number(community.created_by) !== Number(uid)) {
            return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'Active membership required for private community' });
          }
        } else {
          const bannedMembership = await CommunityMember.findOne({
            where: { community_id: communityId, user_id: uid, status: 'banned' },
          });
          if (bannedMembership) {
            return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'Banned from community' });
          }
        }

        await socket.join(`community:${communityId}`);
        if (typeof acknowledge === 'function') acknowledge({ ok: true, communityId });
      } catch (error) {
        logger.error('SOCKET', 'join_community_failed', { communityId, userId: uid, error: error.message });
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Unable to join community room' });
      }
    });


    // ── user:join:society (Enterprise Real-Time Society Room) ─────────────────
    socket.on('user:join:society', async ({ societyId } = {}, acknowledge) => {
      if (!societyId) return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'societyId is required' });
      try {
        const society = await SocietyProfile.findOne({
          where: { id: societyId, is_deleted: false },
        });
        if (!society) {
          return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'Society not found' });
        }

        const isOwner = Number(society.user_id) === Number(uid);
        if (!isOwner) {
          const membership = await SocietyMember.findOne({
            where: { society_id: societyId, user_id: uid, status: 'active', is_deleted: false },
          });
          if (!membership) {
            return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'Active society membership required' });
          }
        }

        await socket.join(`society:${societyId}`);
        if (typeof acknowledge === 'function') acknowledge({ ok: true, societyId });
      } catch (error) {
        logger.error('SOCKET', 'join_society_failed', { societyId, userId: uid, error: error.message });
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Unable to join society room' });
      }
    });

    socket.on('user:leave:society', ({ societyId }) => {
      if (!societyId) return;
      socket.leave(`society:${societyId}`);
    });

    socket.on('user:leave:community', ({ communityId }) => {
      if (!communityId) return;
      socket.leave(`community:${communityId}`);
    });

    socket.on('message:delivered', async ({ messageId } = {}, acknowledge) => {
      try {
        const message = await Message.findOne({
          where: { id: messageId, is_deleted: false },
          attributes: ['id', 'chat_id', 'sender_id'],
        });
        const deliveredAt = message && await markDelivered({ messageId, userId: uid });
        if (!message || !deliveredAt) {
          return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'Receipt not found' });
        }
        const payload = { messageId, chatId: message.chat_id, userId: uid, deliveredAt };
        io.to(`user:${message.sender_id}`).emit('message:delivered', payload);
        if (typeof acknowledge === 'function') acknowledge({ ok: true, ...payload });
      } catch (error) {
        logger.error('SOCKET', 'delivery_receipt_failed', { messageId, userId: uid, error: error.message });
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Unable to update receipt' });
      }
    });

    socket.on('message:read', async ({ messageId } = {}, acknowledge) => {
      try {
        const message = await Message.findOne({
          where: { id: messageId, is_deleted: false },
          attributes: ['id', 'chat_id', 'sender_id'],
        });
        const readAt = message && await markRead({ messageId, userId: uid });
        if (!message || !readAt) {
          return typeof acknowledge === 'function' && acknowledge({ ok: false, error: 'Receipt not found' });
        }
        const payload = { messageId, chatId: message.chat_id, userId: uid, readAt };
        io.to(`user:${message.sender_id}`).emit('message:read', payload);
        if (typeof acknowledge === 'function') acknowledge({ ok: true, ...payload });
      } catch (error) {
        logger.error('SOCKET', 'read_receipt_failed', { messageId, userId: uid, error: error.message });
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Unable to update receipt' });
      }
    });

    socket.on('disconnect', async () => {
      clearInterval(heartbeat);
      const disconnectUid = socket.userId;
      if (disconnectUid) {
        const sockets = userSocketsMap.get(disconnectUid);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) userSocketsMap.delete(disconnectUid);
        }
        await presenceReady;
        const result = await handleUserSocketDisconnect(io, disconnectUid);
        if (result.offline) {
          presenceUpdatesTotal.inc({ type: 'offline' });
          io.emit('presence:offline', {
            userId: disconnectUid,
            last_seen: result.lastSeen,
          });
        }
      }
      logger.socketDisconnect({ socketId: socket.id, userId: disconnectUid });
      socketDisconnectionsTotal.inc();
      socketConnectionsActive.dec();
    });
  });

  if (getIsRedisAvailable()) {
    const pub = getPubClient();
    const sub = getSubClient();
    if (pub && sub) {
      io.adapter(createAdapter(pub, sub));
      console.log('✅ Socket.IO Redis adapter configured.');
    }
  } else {
    console.warn('⚠️  Socket.IO emitter: Redis unavailable — worker emits will not reach API clients');
  }

  return io;
};

export const broadcastMessage = (io, chatId, message) => {
  io.to(`chat:${chatId}`).emit('chat:message', normalizeMediaPayload(message));
};

export const revokeUserFromChatRoom = async (chatId, userId) => {
  if (!_io) return;
  const sockets = await _io.in(`user:${userId}`).fetchSockets();
  await Promise.all(sockets.map((socket) => socket.leave(`chat:${chatId}`)));
  _io.to(`user:${userId}`).emit('chat:access-revoked', { chatId: Number(chatId) });
};


export const revokeUserFromSocietyRoom = async (societyId, userId) => {
  if (!_io) return;
  const sockets = await _io.in(`user:${userId}`).fetchSockets();
  await Promise.all(sockets.map((socket) => socket.leave(`society:${societyId}`)));
  _io.to(`user:${userId}`).emit('society:access-revoked', { societyId: Number(societyId) });
};

export const isUserOnlineLocal = (userId) => userSocketsMap.has(String(userId));

export const resetLocalPresenceMapForTests = () => {
  userSocketsMap.clear();
};
