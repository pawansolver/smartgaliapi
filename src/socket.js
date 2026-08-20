import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import User from './modules/user/user.model.js';
import ChatParticipant from './modules/chat_participant/chat_participant.model.js';
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

/**
 * Socket.IO Online Presence & Signaling Layer
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Drives online status, typing indicators, and real-time message delivery.
 *
 * Scalability:
 *  - Uses @socket.io/redis-adapter if Redis is configured, enabling
 *    broadcasts across multiple Node.js server instances seamlessly.
 *  - Presence offline decisions use adapter fetchSockets so API-1 disconnect
 *    does not mark a user offline while API-2 still has sockets.
 *  - Redis TTL heartbeat clears stale is_online after crashes / unclean drops.
 *  - Gracefully falls back to in-memory mode if Redis is down/missing.
 *
 * Events Emitted by Server:
 *   - 'presence:online'   { userId }
 *   - 'presence:offline'  { userId, last_seen }
 *   - 'chat:message'      { message }
 *   - 'chat:typing'       { chatId, userId, isTyping }
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

// userId â†’ set of socketIds mapping (local to this instance only)
// Cluster-wide truth uses Socket.IO rooms + Redis presence TTL.
const userSocketsMap = new Map();

/** Heartbeat interval â€” keep Redis TTL alive while connected. */
const PRESENCE_HEARTBEAT_MS = Math.max(
  15_000,
  Math.floor((PRESENCE_TTL_SECONDS * 1000) / 3),
);

// Singleton io reference â€” used by services to broadcast after DB writes
let _io = null;

/**
 * Returns the initialized Socket.IO server instance.
 * Usage: import { getIO } from '../../socket.js'; getIO().to(`chat:${chatId}`).emit('chat:message', msg)
 * @returns {import('socket.io').Server}
 */
export const getIO = () => {
  if (!_io) throw new Error('Socket.IO not initialized. Call initSocket() first.');
  return _io;
};

/**
 * Initialise the Socket.IO server and attach it to Express http.Server.
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server} io
 */
export const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: '*', // tighten in production
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  // Store singleton reference for getIO()
  _io = io;

  // â”€â”€ Redis Adapter Setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (getIsRedisAvailable()) {
    const pubClient = getPubClient();
    const subClient = getSubClient();
    if (pubClient && subClient) {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('âœ… Socket.IO: Redis adapter attached (Multi-instance sync ON)');
    }
  } else {
    console.warn('âš ï¸ Socket.IO: Redis adapter skipped (Running in single-instance mode)');
  }

  // Authenticate before any event handler can trust the socket identity.
  io.use(async (socket, next) => {
    try {
      const authorization = socket.handshake.headers.authorization;
      const supplied = socket.handshake.auth?.token || authorization;
      const token = supplied?.startsWith?.('Bearer ') ? supplied.slice(7) : supplied;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, env.jwt.secret);
      const userId = decoded.id ?? decoded.userId ?? decoded.sub;
      if (!userId) return next(new Error('Invalid token'));
      const user = await User.findOne({
        where: { userId, is_deleted: false, is_active: true, status: 'active' },
        attributes: ['userId'],
      });
      if (!user) return next(new Error('Account is unavailable'));
      socket.userId = String(user.userId);
      socket.user = { ...decoded, id: user.userId };
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

    // Cluster-safe online: DB + Redis TTL; emit only on offlineâ†’online transition
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

    // Backward-compatible event: identity is derived from JWT, never the payload.
    // Clients cannot mark another user online via payload.userId.
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

    // â”€â”€ chat:typing (Typing Indicators) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on('chat:typing', ({ chatId, isTyping } = {}) => {
      if (!chatId || !socket.rooms.has(`chat:${chatId}`)) return;
      // Broadcast to the chat room (excluding the sender)
      socket.to(`chat:${chatId}`).emit('chat:typing', { 
        chatId, 
        userId: socket.userId, 
        isTyping 
      });
    });

    // â”€â”€ user:join:chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        await socket.join(`chat:${chatId}`);
        if (typeof acknowledge === 'function') acknowledge({ ok: true, chatId });
      } catch (error) {
        logger.error('SOCKET', 'join_chat_failed', { chatId, userId: uid, error: error.message });
        if (typeof acknowledge === 'function') acknowledge({ ok: false, error: 'Unable to join chat' });
      }
    });

    // â”€â”€ user:leave:chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    socket.on('user:leave:chat', ({ chatId }) => {
      if (!chatId) return;
      socket.leave(`chat:${chatId}`);
    });

    // â”€â”€ message:delivered (Double Grey Tick) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ disconnect â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        // Multi-instance safe: only offline when no sockets remain in user room cluster-wide
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

  return io;
};

/**
 * Initialise a Socket.IO emitter for background workers (no HTTP listen).
 * With the Redis adapter attached, emits reach sockets on API instances.
 */
export const initSocketEmitter = () => {
  const io = new Server({
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });
  _io = io;

  if (getIsRedisAvailable()) {
    const pubClient = getPubClient();
    const subClient = getSubClient();
    if (pubClient && subClient) {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('âœ… Socket.IO emitter: Redis adapter attached (worker â†’ API broadcast)');
    }
  } else {
    console.warn('âš ï¸ Socket.IO emitter: Redis unavailable â€” worker emits will not reach API clients');
  }

  return io;
};

/**
 * Utility: push a real-time message to all members of a chat room.
 */
export const broadcastMessage = (io, chatId, message) => {
  io.to(`chat:${chatId}`).emit('chat:message', normalizeMediaPayload(message));
};

/**
 * Utility: check if a user is online locally on THIS instance.
 * For FCM / global checks use getOnlineFlagsForPush (Redis heartbeat).
 */
export const isUserOnlineLocal = (userId) => userSocketsMap.has(String(userId));

/** Test helper â€” clear local socket map between unit tests. */
export const resetLocalPresenceMapForTests = () => {
  userSocketsMap.clear();
};

