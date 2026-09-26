import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import ParkingSlot from './parking_slot.model.js';
import User from '../user/user.model.js';

export const VIOLATION_STATUS = Object.freeze({
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  ACTION_TAKEN: 'ACTION_TAKEN',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
});

const ParkingViolation = sequelize.define('ParkingViolation', {
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
  slot_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ParkingSlot,
      key: 'id',
    },
  },
  slot_number: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  reporter_user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  reporter_flat_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  unauthorized_vehicle_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  reason_code: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'OPEN',
  },
  assigned_to: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  acknowledged_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resolution_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  tableName: 'parking_violations',
});

ParkingViolation.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
ParkingViolation.belongsTo(ParkingSlot, { foreignKey: 'slot_id', as: 'slot' });
ParkingViolation.belongsTo(User, { foreignKey: 'reporter_user_id', as: 'reporter' });

export default ParkingViolation;
