import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import SocietyProfile from './society_profile.model.js';

/**
 * SocietyAuditLog Model — Enterprise Immutable Audit Trail
 */
const SocietyAuditLog = sequelize.define('SocietyAuditLog', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyProfile,
      key: 'id',
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
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'society_audit_logs',
  timestamps: false,
  indexes: [
    { fields: ['society_id', 'created_at'] },
    { fields: ['actor_user_id', 'action'] },
    { fields: ['target_user_id'] },
  ],
});

SocietyAuditLog.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyAuditLog.belongsTo(User, { foreignKey: 'actor_user_id', as: 'actor' });
SocietyAuditLog.belongsTo(User, { foreignKey: 'target_user_id', as: 'targetUser' });

export default SocietyAuditLog;
