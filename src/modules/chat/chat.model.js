import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Community from '../community/community.model.js';
import Event from '../event/event.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

/**
 * Chat Model — Enterprise Level
 *
 * Supports: one_to_one, group, community, event, business chat types.
 * Fields added for UI-driven features:
 *  - name/avatar_url        → group chat display
 *  - last_message_id        → chat list preview (linked after Message is defined)
 *  - last_message_at        → sort chat list newest-first
 *  - is_pinned              → pin a chat to top
 *  - description            → group info/about
 */
const Chat = sequelize.define('Chat', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },

  // ── Chat Type ─────────────────────────────────────────────────────────────
  chat_type: {
    type: DataTypes.ENUM('one_to_one', 'group', 'community', 'event', 'business'),
    defaultValue: 'one_to_one',
    allowNull: false,
  },

  // ── Group/Channel Identity ─────────────────────────────────────────────────
  name: {
    type: DataTypes.STRING(120),
    allowNull: true,           // null for one_to_one (name derived from participant)
    comment: 'Display name for group/community/event chats',
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Group or channel description / about text',
  },
  avatar_url: {
    type: DataTypes.STRING(512),
    allowNull: true,
    comment: 'Group avatar image URL',
  },

  // ── Last Message Cache (for chat list preview) ─────────────────────────────
  // NOTE: last_message_id is a plain BIGINT (no FK constraint here to avoid
  // circular dependency — Message model doesn't exist yet when Chat is loaded).
  last_message_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    comment: 'ID of the most recent message; used to render chat list preview',
  },
  last_message_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of the last message; used to sort chat list newest-first',
  },

  // ── Chat Flags ─────────────────────────────────────────────────────────────
  is_pinned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Global pin flag (admin-level); per-user pin lives in ChatParticipant',
  },

  // ── Foreign Keys ───────────────────────────────────────────────────────────
  community_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: Community, key: 'communityId' },
  },
  event_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: Event, key: 'id' },
  },
  business_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: BusinessProfile, key: 'id' },
  },

  ...commonFields,

  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: User, key: 'userId' },
  },
}, {
  timestamps: false,
  tableName: 'chats',
});

// ── Associations ──────────────────────────────────────────────────────────────
Chat.belongsTo(User,            { foreignKey: 'created_by',  as: 'creator'   });
Chat.belongsTo(Community,       { foreignKey: 'community_id', as: 'community' });
Chat.belongsTo(Event,           { foreignKey: 'event_id',     as: 'event'     });
Chat.belongsTo(BusinessProfile, { foreignKey: 'business_id',  as: 'business'  });

export default Chat;
