import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import ParkingSlot from './parking_slot.model.js';
import SocietyVehicle from './society_vehicle.model.js';
import User from '../user/user.model.js';
import SocietyMember from '../society_member/society_member.model.js';

export const ALLOCATION_TYPE = Object.freeze({
  PERMANENT: 'permanent',
  TEMPORARY: 'temporary',
});

export const ALLOCATION_STATUS = Object.freeze({
  ACTIVE: 'active',
  RELEASED: 'released',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
});

const ParkingAllocation = sequelize.define('ParkingAllocation', {
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
    allowNull: false,
    references: {
      model: ParkingSlot,
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
  resident_user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  society_member_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: SocietyMember,
      key: 'id',
    },
  },
  flat_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  allocation_type: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'permanent',
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'active',
  },
  start_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  end_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  allocated_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  released_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  released_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  release_reason: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  notes: {
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
  tableName: 'parking_allocations',
});

ParkingAllocation.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
ParkingAllocation.belongsTo(ParkingSlot, { foreignKey: 'slot_id', as: 'slot' });
ParkingSlot.hasMany(ParkingAllocation, { foreignKey: 'slot_id', as: 'allocations' });
ParkingSlot.hasOne(ParkingAllocation, {
  foreignKey: 'slot_id',
  as: 'activeAllocation',
  scope: { status: 'active', is_deleted: false },
});

ParkingAllocation.belongsTo(SocietyVehicle, { foreignKey: 'vehicle_id', as: 'vehicle' });
SocietyVehicle.hasMany(ParkingAllocation, { foreignKey: 'vehicle_id', as: 'allocations' });

ParkingAllocation.belongsTo(User, { foreignKey: 'resident_user_id', as: 'resident' });
ParkingAllocation.belongsTo(SocietyMember, { foreignKey: 'society_member_id', as: 'member' });

export default ParkingAllocation;
