import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Chat from '../chat/chat.model.js';

/**
 * ChatParticipant Model — Enterprise Level
 *
 * UI-driven additions:
 *  - last_read_message_id → used to compute unread_count per participant
 *  - unread_count         → cached badge count shown in chat list (orange circle)
 *  - is_muted / muted_until → mute push notifications
 *  - nickname             → per-user custom name for a contact
 *  - is_pinned            → per-user chat pin (different from global Chat.is_pinned)
 */
const ChatParticipant = sequelize.define('ChatParticipant', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },

  // ── Core References ────────────────────────────────────────────────────────
  chat_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: Chat, key: 'id' },
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: User, key: 'userId' },
  },

  // ── Participant Role ───────────────────────────────────────────────────────
  role: {
    type: DataTypes.ENUM('admin', 'member'),
    defaultValue: 'member',
    comment: 'admin can add/remove members, change group info',
  },
  joined_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Timestamp when user joined the chat',
  },

  // ── Unread Tracking (Badge in chat list) ──────────────────────────────────
  last_read_message_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'ID of the last message this participant has read; used to compute unread_count',
  },
  unread_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Cached unread message count shown as orange badge in UI',
  },

  // ── Notification Mute ─────────────────────────────────────────────────────
  is_muted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'If true, no push notifications for this chat',
  },
  muted_until: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'If set, mute expires at this time (null = muted forever until unmuted)',
  },

  // ── Per-User Customisation ────────────────────────────────────────────────
  nickname: {
    type: DataTypes.STRING(80),
    allowNull: true,
    comment: 'Custom display name this user has set for the chat or contact',
  },
  is_pinned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Per-user pin: this chat appears at the top of THIS user\'s list',
  },

  ...commonFields,
}, {
  timestamps: false,
  tableName: 'chat_participants',
});

// ── Associations ──────────────────────────────────────────────────────────────
ChatParticipant.belongsTo(Chat, { foreignKey: 'chat_id', as: 'chat' });
ChatParticipant.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default ChatParticipant;
