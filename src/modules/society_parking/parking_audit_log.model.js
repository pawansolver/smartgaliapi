import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

const ParkingAuditLog = sequelize.define('ParkingAuditLog', {
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
  actor_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  actor_role: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  action: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  target_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  target_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  slot_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  flat_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  resident_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  previous_state: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  new_state: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  tableName: 'parking_audit_logs',
});

ParkingAuditLog.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
ParkingAuditLog.belongsTo(User, { foreignKey: 'actor_user_id', as: 'actor' });

export default ParkingAuditLog;
