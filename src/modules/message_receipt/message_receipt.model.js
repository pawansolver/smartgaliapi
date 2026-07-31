import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import Message from '../message/message.model.js';

/**
 * MessageReceipt Model — Enterprise Scale Read/Delivery Tracking
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the scalar is_read / read_at / delivered_at fields on Message
 * with a proper relational table — one row per (message, recipient) pair.
 *
 * This enables accurate per-user receipts in group chats, e.g.:
 *   "Delivered to 5 of 6 members, Read by 3 of 6 members"
 *
 * Indexes:
 *   - (message_id)             → fast per-message receipt lookup
 *   - (user_id, delivered_at)  → "all undelivered messages for user"
 *   - (message_id, user_id)    → unique constraint
 * ─────────────────────────────────────────────────────────────────────────────
 */
const MessageReceipt = sequelize.define('MessageReceipt', {
  id: {
    type:          DataTypes.BIGINT,
    primaryKey:    true,
    autoIncrement: true,
  },
  message_id: {
    type:       DataTypes.BIGINT,
    allowNull:  false,
    references: { model: Message, key: 'id' },
    comment:    'The message this receipt belongs to',
  },
  user_id: {
    type:       DataTypes.BIGINT,
    allowNull:  false,
    references: { model: User, key: 'userId' },
    comment:    'The recipient user this receipt tracks',
  },

  // ── Delivery receipt (double grey tick) ─────────────────────────────────────
  delivered_at: {
    type:     DataTypes.DATE,
    allowNull: true,
    comment:  'Set when message is delivered to the recipient\'s device',
  },

  // ── Read receipt (double blue tick) ─────────────────────────────────────────
  read_at: {
    type:     DataTypes.DATE,
    allowNull: true,
    comment:  'Set when recipient opens/reads the message',
  },

  created_at: {
    type:         DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps:  false,
  tableName:   'message_receipts',
  indexes: [
    { fields: ['message_id'] },
    { fields: ['user_id', 'delivered_at'] },
    { unique: true, fields: ['message_id', 'user_id'], name: 'uq_receipt_message_user' },
  ],
});

// ── Associations ──────────────────────────────────────────────────────────────
MessageReceipt.belongsTo(Message, { foreignKey: 'message_id', as: 'message' });
MessageReceipt.belongsTo(User,    { foreignKey: 'user_id',    as: 'recipient' });
Message.hasMany(MessageReceipt,   { foreignKey: 'message_id', as: 'receipts' });

export default MessageReceipt;
