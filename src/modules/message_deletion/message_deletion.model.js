import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import Message from '../message/message.model.js';

/**
 * MessageDeletion Model — Relational "Delete For Me" Table
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the JSON deleted_for array on Message with a proper relational
 * table. Each row means "this user cannot see this message."
 *
 * Benefits over JSON:
 *  - Clean membership check: WHERE message_id=X AND user_id=Y (indexed)
 *  - No JSON parse overhead on every message read
 *  - GDPR-friendly: can hard-delete deletion records separately
 *
 * Index:
 *  - (message_id, user_id) UNIQUE — ensures one record per (message, user)
 * ─────────────────────────────────────────────────────────────────────────────
 */
const MessageDeletion = sequelize.define('MessageDeletion', {
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
    comment:    'User who deleted this message for themselves',
  },
  deleted_at: {
    type:         DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment:      'When the user performed the delete-for-me action',
  },
}, {
  timestamps: false,
  tableName:  'message_deletions',
  indexes: [
    {
      unique: true,
      fields: ['message_id', 'user_id'],
      name:   'uq_deletion_message_user',
    },
    { fields: ['user_id'] },
  ],
});

// ── Associations ──────────────────────────────────────────────────────────────
MessageDeletion.belongsTo(Message, { foreignKey: 'message_id', as: 'message' });
MessageDeletion.belongsTo(User,    { foreignKey: 'user_id',    as: 'deletedBy' });
Message.hasMany(MessageDeletion,   { foreignKey: 'message_id', as: 'deletions' });

export default MessageDeletion;
