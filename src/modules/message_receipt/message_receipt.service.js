import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import MessageReceipt from './message_receipt.model.js';
import ChatParticipant from '../chat_participant/chat_participant.model.js';
import { logger } from '../../utils/logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE RECEIPTS FOR ALL PARTICIPANTS when a message is sent
//    Called inside the sendMessage transaction.
// ─────────────────────────────────────────────────────────────────────────────
export const createReceiptsForMessage = async ({ messageId, chatId, senderId, transaction }) => {
  const participants = await ChatParticipant.findAll({
    where:      { chat_id: chatId, is_deleted: false, user_id: { [Op.ne]: senderId } },
    attributes: ['user_id'],
    transaction,
  });

  if (!participants.length) return;

  await MessageReceipt.bulkCreate(
    participants.map((p) => ({
      message_id:   messageId,
      user_id:      p.user_id,
      delivered_at: null,
      read_at:      null,
    })),
    { transaction, ignoreDuplicates: true }
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. MARK DELIVERED — set delivered_at for a specific (message, user) pair
// ─────────────────────────────────────────────────────────────────────────────
export const markDelivered = async ({ messageId, userId }) => {
  const [affected] = await MessageReceipt.update(
    { delivered_at: new Date() },
    {
      where: { message_id: messageId, user_id: userId, delivered_at: null },
    }
  );
  const receipt = await MessageReceipt.findOne({
    where: { message_id: messageId, user_id: userId },
    attributes: ['delivered_at'],
  });
  if (!receipt) return null;
  const deliveredAt = receipt.delivered_at;
  if (!affected && !deliveredAt) return null;
  logger.messageDelivered({ messageId, userId, deliveredAt });
  return deliveredAt;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. MARK READ — set read_at for a specific (message, user) pair
// ─────────────────────────────────────────────────────────────────────────────
export const markRead = async ({ messageId, userId }) => {
  const now = new Date();

  const [affected] = await MessageReceipt.update(
    { delivered_at: sequelize.literal('COALESCE(delivered_at, NOW())'), read_at: now },
    {
      where: { message_id: messageId, user_id: userId, read_at: null },
    }
  );

  const receipt = await MessageReceipt.findOne({
    where: { message_id: messageId, user_id: userId },
    attributes: ['read_at'],
  });
  if (!receipt) return null;
  if (affected > 0) {
    logger.messageRead({ messageId, userId, readAt: now });
  }
  return receipt.read_at ?? now;
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. MARK ALL READ in a chat (resets unread badge)
// ─────────────────────────────────────────────────────────────────────────────
export const markAllReadInChat = async ({ chatId, userId, latestMessageId, transaction }) => {
  const now = new Date();
  await MessageReceipt.update(
    { delivered_at: sequelize.literal('COALESCE(delivered_at, NOW())'), read_at: now },
    {
      where: {
        user_id: userId,
        read_at: null,
        // Only receipts for messages in this chat (sub-select)
        message_id: {
          [Op.in]: sequelize.literal(
            `(SELECT id FROM messages WHERE chat_id = ${chatId} AND is_deleted = 0)`
          ),
        },
      },
      transaction,
    }
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET RECEIPT SUMMARY for a message (for WhatsApp-style "info" screen)
//    Returns count of delivered, read, and pending recipients.
// ─────────────────────────────────────────────────────────────────────────────
export const getReceiptSummary = async (messageId) => {
  const receipts = await MessageReceipt.findAll({
    where:      { message_id: messageId },
    attributes: ['user_id', 'delivered_at', 'read_at'],
  });

  return {
    total:     receipts.length,
    delivered: receipts.filter((r) => r.delivered_at).length,
    read:      receipts.filter((r) => r.read_at).length,
    pending:   receipts.filter((r) => !r.delivered_at).length,
    receipts,
  };
};
