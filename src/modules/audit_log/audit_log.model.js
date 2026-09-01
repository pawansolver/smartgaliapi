import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';

/**
 * AuditLog Model — Immutable Action History
 * ─────────────────────────────────────────────────────────────────────────────
 * Records every admin/user action that mutates system state:
 *   - Message edit / delete / forward
 *   - Group admin actions (add, remove, promote)
 *   - Chat create / delete
 *   - Media uploads
 *
 * Design principles:
 *  - INSERT-only (never UPDATE / DELETE)
 *  - Stores before/after snapshot in JSON for diff
 *  - Indexed on actor_id + action for compliance queries
 * ─────────────────────────────────────────────────────────────────────────────
 */
const AuditLog = sequelize.define('AuditLog', {
  id: {
    type:          DataTypes.BIGINT,
    primaryKey:    true,
    autoIncrement: true,
  },

  // ── Who ──────────────────────────────────────────────────────────────────────
  actor_id: {
    type:       DataTypes.BIGINT,
    allowNull:  false,
    references: { model: User, key: 'userId' },
    comment:    'User who performed the action',
  },

  // ── What ─────────────────────────────────────────────────────────────────────
  action: {
    type:      DataTypes.STRING(60),
    allowNull: false,
    comment:   'e.g. message.edit | message.delete | chat.create | member.remove',
  },

  // ── On What ──────────────────────────────────────────────────────────────────
  target_type: {
    type:      DataTypes.STRING(40),
    allowNull: false,
    comment:   'Entity type: message | chat | chat_participant | media',
  },
  target_id: {
    type:      DataTypes.BIGINT,
    allowNull: true,
    comment:   'Primary key of the affected entity',
  },

  // ── Context ───────────────────────────────────────────────────────────────────
  chat_id: {
    type:     DataTypes.BIGINT,
    allowNull: true,
    comment:  'Chat context for quick filtering',
  },

  // ── Diff ────────────────────────────────────────────────────────────────────
  before_snapshot: {
    type:     DataTypes.JSON,
    allowNull: true,
    comment:  'State of the entity before the action',
  },
  after_snapshot: {
    type:     DataTypes.JSON,
    allowNull: true,
    comment:  'State of the entity after the action',
  },

  // ── Meta ────────────────────────────────────────────────────────────────────
  ip_address: {
    type:      DataTypes.STRING(45),
    allowNull: true,
  },
  user_agent: {
    type:      DataTypes.STRING(255),
    allowNull: true,
  },
  created_at: {
    type:         DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName:  'audit_logs',
  indexes: [
    { fields: ['actor_id', 'action'] },
    { fields: ['target_type', 'target_id'] },
    { fields: ['chat_id'] },
    { fields: ['created_at'] },
  ],
});

// ── Associations ──────────────────────────────────────────────────────────────
AuditLog.belongsTo(User, { foreignKey: 'actor_id', as: 'actor' });

export default AuditLog;
