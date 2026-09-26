import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import ParkingAllocation from './parking_allocation.model.js';
import SocietyVehicle from './society_vehicle.model.js';

export const PASS_STATUS = Object.freeze({
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  LOST: 'lost',
});

const ParkingAccessPass = sequelize.define('ParkingAccessPass', {
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
  allocation_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: ParkingAllocation,
      key: 'id',
    },
  },
  vehicle_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: SocietyVehicle,
      key: 'id',
    },
  },
  pass_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'RFID_FASTAG',
  },
  pass_identifier: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'active',
  },
  issued_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  valid_from: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  valid_until: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  revoked_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  revoked_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  revocation_reason: {
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
  tableName: 'parking_access_passes',
});

ParkingAccessPass.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
ParkingAccessPass.belongsTo(ParkingAllocation, { foreignKey: 'allocation_id', as: 'allocation' });
ParkingAllocation.hasMany(ParkingAccessPass, { foreignKey: 'allocation_id', as: 'passes' });

export default ParkingAccessPass;
