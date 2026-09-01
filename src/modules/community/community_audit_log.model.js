import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import Community from './community.model.js';

/**
 * CommunityAuditLog Model — Phase 9
 * ─────────────────────────────────────────────────────────────────────────────
 * Immutable append-only audit trail for all sensitive community events.
 * Never updated or deleted by normal users or community admins.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const CommunityAuditLog = sequelize.define('CommunityAuditLog', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  community_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: Community,
      key: 'communityId',
    },
  },
  actor_user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  action: {
    type: DataTypes.STRING(80),
    allowNull: false,
  },
  target_user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  target_entity_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  target_entity_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  old_value: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  new_value: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  request_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'community_audit_logs',
  timestamps: false,
  indexes: [
    { fields: ['community_id', 'created_at'] },
    { fields: ['actor_user_id', 'action'] },
    { fields: ['target_user_id'] },
  ],
});

CommunityAuditLog.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
CommunityAuditLog.belongsTo(User, { foreignKey: 'actor_user_id', as: 'actor' });
CommunityAuditLog.belongsTo(User, { foreignKey: 'target_user_id', as: 'targetUser' });

export default CommunityAuditLog;
