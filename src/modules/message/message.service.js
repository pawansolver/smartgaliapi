import { Op }       from 'sequelize';
import sequelize     from '../../config/db.js';
import Message       from './message.model.js';
import Chat          from '../chat/chat.model.js';
import ChatParticipant    from '../chat_participant/chat_participant.model.js';
import User               from '../user/user.model.js';
import UserProfile        from '../userProfile/userProfile.model.js';
import MessageReceipt     from '../message_receipt/message_receipt.model.js';
import MessageDeletion    from '../message_deletion/message_deletion.model.js';
import MessageReaction    from '../message_reaction/message_reaction.model.js';
import { createReceiptsForMessage } from '../message_receipt/message_receipt.service.js';
import { toggleReaction, getReactionSummary, bulkLoadReactions } from '../message_reaction/message_reaction.service.js';
import { emitNotification, resolveDisplayName } from '../notification/notification.service.js';
import { checkIdempotencyKey, storeIdempotencyKey } from '../../config/redis.js';
import { auditMessageEdit, auditMessageDelete, auditMessageForward } from '../modules/../audit_log/audit_log.service.js';
import { logger } from '../../utils/logger.js';
import { broadcastMessage, getIO } from '../../socket.js';

// ── Shared includes for message reads ─────────────────────────────────────────
const MESSAGE_INCLUDES = [
  {
    model:      User,
    as:         'sender',
    attributes: ['userId', 'userName'],
    include:    [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl'] }],
  },
  {
    model:      Message,
    as:         'repliedMessage',
    attributes: ['id', 'message', 'message_type', 'sender_id', 'media_url'],
  },
];

const emitChatEvent = (chatId, event, payload) => {
  try {
    getIO().to(`chat:${chatId}`).emit(event, payload);
  } catch (error) {
    logger.warn('MESSAGE', 'socket_event_skipped', { chatId, event, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL: Hydrate messages with relational reactions and deletion status
// ─────────────────────────────────────────────────────────────────────────────
const hydrateMessages = async (messages, requestingUserId) => {
  if (!messages.length) return [];

  const ids = messages.map((m) => m.id);

  // Bulk-load reactions and deletions to avoid N+1
  const [reactionsMap, deletionSet] = await Promise.all([
    bulkLoadReactions(ids),
    MessageDeletion.findAll({
      where:      { message_id: ids, user_id: requestingUserId },
      attributes: ['message_id'],
    }).then((rows) => new Set(rows.map((r) => String(r.message_id)))),
  ]);

  return messages
    .filter((m) => !deletionSet.has(String(m.id)))  // hide deleted-for-me
    .map((m) => {
      const plain = m.toJSON ? m.toJSON() : m;
      plain.reactionsSummary = reactionsMap[String(m.id)] || {};
      return plain;
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. SEND MESSAGE — Full Enterprise (ACID + Idempotency + Receipts)
// ─────────────────────────────────────────────────────────────────────────────
export const sendMessage = async (messageData) => {
  const {
    chat_id, sender_id, message, message_type = 'text',
    media_url, media_metadata, reply_to,
    is_forwarded = false, location_lat, location_lng,
    idempotency_key,
    created_by,
  } = messageData;

  if (!chat_id)   throw new Error('chat_id is required');
  if (!sender_id) throw new Error('sender_id is required');

  // ── A. Idempotency Check (Redis-fast path) ────────────────────────────────
  if (idempotency_key) {
    const cached = await checkIdempotencyKey(idempotency_key);
    if (cached) {
      logger.info('MESSAGE', 'idempotent_return', { idempotency_key, messageId: cached.id });
      if (cached.message_type && cached.idempotency_key) {
        return { message: cached, idempotent: true };
      }
      // Heal legacy cache entries that only stored id/chat/sender fields.
      const complete = await Message.findOne({
        where: { id: cached.id, idempotency_key },
        include: MESSAGE_INCLUDES,
      });
      if (complete) {
        const serialized = complete.toJSON();
        await storeIdempotencyKey(idempotency_key, serialized);
        return { message: serialized, idempotent: true };
      }
    }
  }

  // ── B. DB-level idempotency (race condition protection) ───────────────────
  if (idempotency_key) {
    const existing = await Message.findOne({
      where:   { idempotency_key },
      include: MESSAGE_INCLUDES,
    });
    if (existing) {
      await storeIdempotencyKey(idempotency_key, existing.toJSON());
      return { message: existing, idempotent: true };
    }
  }

  let newMessage;

  // ── C. ACID Transaction: Insert + Update Chat + Increment Unread + Receipts ─
  await sequelize.transaction(async (t) => {

    // Step 1: Create message
    newMessage = await Message.create({
      chat_id, sender_id, message, message_type,
      media_url, media_metadata, reply_to,
      is_forwarded, location_lat, location_lng,
      idempotency_key: idempotency_key || null,
      created_by:      created_by ?? sender_id,
    }, { transaction: t });

    // Step 2: Update Chat last_message cache
    await Chat.update(
      { last_message_id: newMessage.id, last_message_at: new Date() },
      { where: { id: chat_id }, transaction: t }
    );

    // Step 3: Increment unread_count for all OTHER participants
    await ChatParticipant.increment('unread_count', {
      by:    1,
      where: { chat_id, user_id: { [Op.ne]: sender_id }, is_deleted: false },
      transaction: t,
    });

    // Step 4: Create per-user delivery receipts (enterprise scale)
    await createReceiptsForMessage({
      messageId: newMessage.id,
      chatId:    chat_id,
      senderId:  sender_id,
      transaction: t,
    });
  });

  // ── D. Cache idempotency key in Redis (non-critical) ──────────────────────
  if (idempotency_key) {
    await storeIdempotencyKey(idempotency_key, newMessage.toJSON());
  }

  logger.messageSent({ messageId: newMessage.id, chatId: chat_id, senderId: sender_id, messageType: message_type });

  // ── E. Real-time Socket.IO Broadcast (non-critical, outside transaction) ──
  // Sends 'chat:message' to all clients who have joined the chat room via
  // socket.emit('user:join:chat', { chatId }). This is the core real-time delivery.
  try {
    const io = getIO();
    broadcastMessage(io, chat_id, newMessage);
  } catch (socketErr) {
    // Socket may not be initialized in test environments — safe to ignore
    logger.warn('MESSAGE', 'socket_broadcast_skipped', { chatId: chat_id, error: socketErr.message });
  }

  // ── F. Push notifications (outside transaction, non-critical) ─────────────
  _sendPushNotifications(newMessage, chat_id, sender_id).catch((err) =>
    logger.error('MESSAGE', 'push_notification_failed', { error: err.message })
  );

  return { message: newMessage, idempotent: false };
};

// Fire-and-forget push notification helper
const _sendPushNotifications = async (message, chatId, senderId) => {
  const participants = await ChatParticipant.findAll({
    where:      { chat_id: chatId, is_deleted: false, user_id: { [Op.ne]: senderId } },
    attributes: ['user_id', 'is_muted', 'muted_until'],
  });

  const senderName = await resolveDisplayName(senderId);
  const preview    = (message.message || 'Sent an attachment').toString();
  const truncated  = preview.length > 120 ? `${preview.slice(0, 117)}...` : preview;

  await Promise.all(
    participants
      .filter((p) => {
        if (!p.is_muted) return true;
        return p.muted_until && new Date() > new Date(p.muted_until);
      })
      .map((p) =>
        emitNotification({
          recipientId:   p.user_id,
          actorId:       senderId,
          type:          'message',
          preferenceKey: 'community_chat',
          title:         senderName,
          message:       truncated,
          data: { kind: 'chat_message', chatId, messageId: message.id },
        })
      )
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET CHAT MESSAGES — Cursor-Based Pagination + Hydration
// ─────────────────────────────────────────────────────────────────────────────
export const getChatMessages = async ({ chatId, requestingUserId, cursor, limit = 20 }) => {
  const safeLimit = Math.min(Number(limit) || 20, 100);

  const where = { chat_id: chatId, is_deleted: false };
  if (cursor) where.id = { [Op.lt]: BigInt(cursor) };

  const messages = await Message.findAll({
    where,
    include: MESSAGE_INCLUDES,
    order:   [['id', 'DESC']],
    limit:   safeLimit + 1,
  });

  const hasMore    = messages.length > safeLimit;
  const page       = hasMore ? messages.slice(0, safeLimit) : messages;
  const nextCursor = hasMore ? page[page.length - 1].id.toString() : null;

  const hydrated   = await hydrateMessages(page, requestingUserId);

  return {
    messages:   hydrated.reverse(),
    nextCursor,
    hasMore,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. MARK MESSAGE READ (per-user receipt + unread decrement)
// ─────────────────────────────────────────────────────────────────────────────
export const markMessageRead = async ({ messageId, userId }) => {
  const msg = await Message.findOne({ where: { id: messageId, is_deleted: false } });
  if (!msg) throw new Error('Message not found');
  if (Number(msg.sender_id) === Number(userId)) return msg; // no-op for sender

  await sequelize.transaction(async (t) => {
    // Update receipt row
    await MessageReceipt.update(
      {
        delivered_at: sequelize.literal('COALESCE(delivered_at, NOW())'),
        read_at:      new Date(),
      },
      { where: { message_id: messageId, user_id: userId, read_at: null }, transaction: t }
    );

    // Decrement unread_count (floor at 0)
    const participant = await ChatParticipant.findOne({
      where: { chat_id: msg.chat_id, user_id: userId, is_deleted: false },
      transaction: t,
    });
    if (participant?.unread_count > 0) {
      await participant.decrement('unread_count', { by: 1, transaction: t });
    }
  });

  logger.messageRead({ messageId, userId });
  emitChatEvent(msg.chat_id, 'message:read', {
    messageId,
    chatId: msg.chat_id,
    userId,
    readAt: new Date(),
  });
  return msg;
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. MARK ALL READ in a Chat
// ─────────────────────────────────────────────────────────────────────────────
export const markAllRead = async ({ chatId, userId }) => {
  const participant = await ChatParticipant.findOne({
    where: { chat_id: chatId, user_id: userId, is_deleted: false },
  });
  if (!participant) throw new Error('You are not a participant of this chat');

  const latest = await Message.findOne({
    where:      { chat_id: chatId, is_deleted: false },
    order:      [['id', 'DESC']],
    attributes: ['id'],
  });

  await sequelize.transaction(async (t) => {
    // Reset participant badge
    await participant.update(
      { unread_count: 0, last_read_message_id: latest?.id ?? null },
      { transaction: t }
    );
    // Update all receipts for this user in this chat
    await MessageReceipt.update(
      {
        delivered_at: sequelize.literal('COALESCE(delivered_at, NOW())'),
        read_at:      new Date(),
      },
      {
        where: {
          user_id:  userId,
          read_at:  null,
          message_id: {
            [Op.in]: sequelize.literal(
              `(SELECT id FROM messages WHERE chat_id = ${sequelize.escape(chatId)} AND is_deleted = 0)`
            ),
          },
        },
        transaction: t,
      }
    );
  });

  return { success: true };
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. REACT TO MESSAGE (relational table, atomic toggle)
// ─────────────────────────────────────────────────────────────────────────────
export const reactToMessage = async ({ messageId, userId, emoji }) => {
  const msg = await Message.findOne({ where: { id: messageId, is_deleted: false } });
  if (!msg) throw new Error('Message not found');

  const result = await toggleReaction({ messageId, userId, emoji });
  emitChatEvent(msg.chat_id, 'message:reaction', {
    messageId,
    chatId: msg.chat_id,
    ...result,
  });
  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. EDIT MESSAGE (audit logged)
// ─────────────────────────────────────────────────────────────────────────────
export const editMessage = async ({ messageId, userId, newText, ip, ua }) => {
  const msg = await Message.findOne({ where: { id: messageId, is_deleted: false } });
  if (!msg)                              throw new Error('Message not found');
  if (Number(msg.sender_id) !== Number(userId)) throw new Error('You can only edit your own messages');
  if (msg.message_type !== 'text')       throw new Error('Only text messages can be edited');

  const before = { message: msg.message };
  await msg.update({ message: newText, is_edited: true, edited_at: new Date() });

  auditMessageEdit({ actorId: userId, targetId: messageId, chatId: msg.chat_id, before, after: { message: newText }, ip, ua });
  emitChatEvent(msg.chat_id, 'message:edited', {
    messageId,
    chatId: msg.chat_id,
    message: newText,
    is_edited: true,
    edited_at: msg.edited_at,
  });
  return msg;
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. DELETE FOR ME (relational table)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteForMe = async ({ messageId, userId, ip, ua }) => {
  const msg = await Message.findOne({ where: { id: messageId, is_deleted: false } });
  if (!msg) throw new Error('Message not found');

  await MessageDeletion.findOrCreate({
    where:    { message_id: messageId, user_id: userId },
    defaults: { message_id: messageId, user_id: userId },
  });

  auditMessageDelete({ actorId: userId, targetId: messageId, chatId: msg.chat_id, after: { scope: 'for_me' }, ip, ua });
  try {
    getIO().to(`user:${userId}`).emit('message:deleted', {
      messageId,
      chatId: msg.chat_id,
      scope: 'for_me',
    });
  } catch (error) {
    logger.warn('MESSAGE', 'socket_event_skipped', { chatId: msg.chat_id, event: 'message:deleted', error: error.message });
  }
  return { success: true };
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. FORWARD MESSAGE (audit logged, uses sendMessage for atomicity)
// ─────────────────────────────────────────────────────────────────────────────
export const forwardMessage = async ({ messageId, targetChatId, senderId, created_by, ip, ua }) => {
  const original = await Message.findOne({ where: { id: messageId, is_deleted: false } });
  if (!original) throw new Error('Original message not found');

  const result = await sendMessage({
    chat_id:        targetChatId,
    sender_id:      senderId,
    message:        original.message,
    message_type:   original.message_type,
    media_url:      original.media_url,
    media_metadata: original.media_metadata,
    is_forwarded:   true,
    location_lat:   original.location_lat,
    location_lng:   original.location_lng,
    created_by:     created_by ?? senderId,
  });

  auditMessageForward({
    actorId: senderId, targetId: messageId,
    chatId: targetChatId,
    after: { originalChatId: original.chat_id, targetChatId },
    ip, ua,
  });

  return result.message;
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. SEARCH MESSAGES (delegates to search abstraction)
// ─────────────────────────────────────────────────────────────────────────────
export const searchMessages = async ({ chatId, query, limit = 30, cursor = null, messageType = null }) => {
  const { searchMessages: searchFn } = await import('../../utils/search.service.js');
  return await searchFn({ chatId, query, limit, beforeId: cursor, messageType });
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. GET CHAT MEDIA (gallery view)
// ─────────────────────────────────────────────────────────────────────────────
export const getChatMedia = async ({ chatId, type, limit = 50 }) => {
  const safeLimit = Math.min(Number(limit) || 50, 200);
  const where = { chat_id: chatId, is_deleted: false, media_url: { [Op.ne]: null } };
  if (type) where.message_type = type;

  return await Message.findAll({
    where,
    attributes: ['id', 'message_type', 'media_url', 'media_metadata', 'created_at', 'sender_id'],
    include:    [{ model: User, as: 'sender', attributes: ['userId', 'userName'] }],
    order:      [['id', 'DESC']],
    limit:      safeLimit,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 11. GET RECEIPT SUMMARY for one message
// ─────────────────────────────────────────────────────────────────────────────
export const getMessageReceiptSummary = async (messageId) => {
  const { getReceiptSummary } = await import('../message_receipt/message_receipt.service.js');
  return await getReceiptSummary(messageId);
};

// ─────────────────────────────────────────────────────────────────────────────
// Legacy CRUD (backward compatible)
// ─────────────────────────────────────────────────────────────────────────────
export const createMessage = async (data) => {
  const result = await sendMessage(data);
  return result.message;
};

export const getAllMessages = async () =>
  Message.findAll({
    where:   { is_deleted: false },
    include: [...MESSAGE_INCLUDES, { model: Chat, as: 'chat', attributes: ['id', 'chat_type'] }],
  });

export const getMessageById = async (id) =>
  Message.findOne({
    where:   { id, is_deleted: false },
    include: [...MESSAGE_INCLUDES, { model: Chat, as: 'chat', attributes: ['id', 'chat_type'] }],
  });

export const updateMessage = async (id, updateData) => {
  const message = await Message.findOne({ where: { id, is_deleted: false } });
  if (!message) return null;
  const updated = await message.update({ ...updateData, updatedAt: new Date() });
  emitChatEvent(message.chat_id, 'message:edited', updated);
  return updated;
};

export const softDeleteMessage = async (id, deletedRemarks, updated_by) => {
  const message = await Message.findOne({ where: { id, is_deleted: false } });
  if (!message) return null;
  const updated = await message.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
  emitChatEvent(message.chat_id, 'message:deleted', { messageId: id, chatId: message.chat_id, scope: 'everyone' });
  return updated;
};

export const bulkSoftDeleteMessages = async (ids, deletedRemarks, updated_by) =>
  Message.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
