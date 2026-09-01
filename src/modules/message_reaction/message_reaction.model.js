import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import Message from '../message/message.model.js';

/**
 * MessageReaction Model — Relational Reactions Table
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the JSON reactions field on Message with a proper relational table.
 *
 * Benefits over JSON:
 *  - Fast aggregation:  GROUP BY emoji
 *  - User lookup:       "who reacted with 👍?"
 *  - Index-backed:      O(log n) lookup vs O(n) JSON scan
 *  - Atomic toggle:     INSERT / DELETE instead of JSON merge
 *
 * Indexes:
 *  - (message_id)            → load all reactions for one message
 *  - (message_id, user_id)   → unique per (message, user, emoji)
 *  - (user_id)               → "all my reactions" query
 * ─────────────────────────────────────────────────────────────────────────────
 */
const MessageReaction = sequelize.define('MessageReaction', {
  id: {
    type:          DataTypes.BIGINT,
    primaryKey:    true,
    autoIncrement: true,
  },
  message_id: {
    type:       DataTypes.BIGINT,
    allowNull:  false,
    references: { model: Message, key: 'id' },
  },
  user_id: {
    type:       DataTypes.BIGINT,
    allowNull:  false,
    references: { model: User, key: 'userId' },
  },
  emoji: {
    type:      DataTypes.STRING(16),
    allowNull: false,
    comment:   'Single emoji character e.g. "👍", "❤️", "😂"',
  },
  created_at: {
    type:         DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName:  'message_reactions',
  indexes: [
    { fields: ['message_id'] },
    { fields: ['user_id'] },
    {
      unique: true,
      fields: ['message_id', 'user_id', 'emoji'],
      name:   'uq_reaction_message_user_emoji',
    },
  ],
});

// ── Associations ──────────────────────────────────────────────────────────────
MessageReaction.belongsTo(Message, { foreignKey: 'message_id', as: 'message' });
MessageReaction.belongsTo(User,    { foreignKey: 'user_id',    as: 'reactor'  });
Message.hasMany(MessageReaction,   { foreignKey: 'message_id', as: 'reactionRows' });

export default MessageReaction;
