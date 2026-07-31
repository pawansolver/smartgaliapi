import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Chat from '../chat/chat.model.js';

/**
 * Message Model — Enterprise Level v2
 *
 * v2 Changes:
 *  - idempotency_key (UNIQUE) — prevents duplicate messages on client retry
 *  - message_type ENUM expanded to 9 types (camera/gallery/mic/location/etc.)
 *  - media_metadata JSON — { file_size, duration, width, height, mime_type, thumbnail_url }
 *  - is_edited / edited_at — "Edited" label on bubbles
 *  - delivered_at / read_at — deprecated scalar; source-of-truth is message_receipts table
 *  - reactions — deprecated JSON; source-of-truth is message_reactions table
 *  - is_forwarded — forward label
 *  - location_lat/lng — location sharing
 *  - deleted_for — deprecated JSON; source-of-truth is message_deletions table
 *
 * NOTE: deprecated fields kept for zero-downtime migration backward compat.
 * They will be removed in a future migration once all clients are upgraded.
 */
const Message = sequelize.define('Message', {
  id: {
    type:          DataTypes.BIGINT,
    primaryKey:    true,
    autoIncrement: true,
  },

  // ── Idempotency (v2) ───────────────────────────────────────────────────────
  idempotency_key: {
    type:      DataTypes.STRING(128),
    allowNull: true,
    unique:    true,
    comment:   'Client-generated UUID to prevent duplicate sends on retry. Unique per sender.',
  },

  // ── Core References ────────────────────────────────────────────────────────
  chat_id: {
    type:       DataTypes.BIGINT,
    allowNull:  false,
    references: { model: Chat, key: 'id' },
  },
  sender_id: {
    type:       DataTypes.BIGINT,
    allowNull:  false,
    references: { model: User, key: 'userId' },
  },

  // ── Message Type ───────────────────────────────────────────────────────────
  message_type: {
    type: DataTypes.ENUM(
      'text', 'image', 'video', 'audio', 'document',
      'location', 'contact', 'sticker', 'gif'
    ),
    defaultValue: 'text',
    allowNull:    false,
    comment:      'Drives UI bubble rendering and media player selection',
  },

  // ── Content ────────────────────────────────────────────────────────────────
  message: {
    type:     DataTypes.TEXT,
    allowNull: true,
    comment:  'Text body; also caption for media messages',
  },
  media_url: {
    type:      DataTypes.STRING(512),
    allowNull: true,
    comment:   'Primary media URL (image, video, audio, document)',
  },
  media_metadata: {
    type:     DataTypes.JSON,
    allowNull: true,
    comment:  '{ file_size, duration, width, height, mime_type, thumbnail_url }',
  },

  // ── Threading ──────────────────────────────────────────────────────────────
  reply_to: {
    type:     DataTypes.BIGINT,
    allowNull: true,
    comment:  'ID of the message being replied to',
  },

  // ── Delivery & Read (scalar — deprecated; use message_receipts table) ───────
  delivered_at: {
    type:     DataTypes.DATE,
    allowNull: true,
    comment:  '[DEPRECATED] Use message_receipts table. Kept for backward compat.',
  },
  read_at: {
    type:     DataTypes.DATE,
    allowNull: true,
    comment:  '[DEPRECATED] Use message_receipts table. Kept for backward compat.',
  },
  is_read: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    comment:      '[DEPRECATED] Use message_receipts table.',
  },

  // ── Edit Tracking ─────────────────────────────────────────────────────────
  is_edited: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
  },
  edited_at: {
    type:     DataTypes.DATE,
    allowNull: true,
  },

  // ── Reactions (JSON — deprecated; use message_reactions table) ─────────────
  reactions: {
    type:         DataTypes.JSON,
    allowNull:    true,
    defaultValue: {},
    comment:      '[DEPRECATED] Use message_reactions table.',
  },

  // ── Forward & Location ────────────────────────────────────────────────────
  is_forwarded: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
  },
  location_lat: {
    type:     DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  location_lng: {
    type:     DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },

  // ── Delete For Me (JSON — deprecated; use message_deletions table) ─────────
  deleted_for: {
    type:         DataTypes.JSON,
    allowNull:    true,
    defaultValue: [],
    comment:      '[DEPRECATED] Use message_deletions table.',
  },

  ...commonFields,
}, {
  timestamps: false,
  tableName:  'messages',
  indexes: [
    { fields: ['chat_id', 'id'] },            // primary read pattern
    { fields: ['sender_id'] },
    { unique: true, fields: ['idempotency_key'], name: 'uq_message_idempotency_key' },
  ],
});

// ── Associations ──────────────────────────────────────────────────────────────
Message.belongsTo(Chat,    { foreignKey: 'chat_id',   as: 'chat'           });
Message.belongsTo(User,    { foreignKey: 'sender_id', as: 'sender'         });
Message.belongsTo(Message, { foreignKey: 'reply_to',  as: 'repliedMessage' });
Message.hasMany(Message,   { foreignKey: 'reply_to',  as: 'replies'        });

export default Message;
