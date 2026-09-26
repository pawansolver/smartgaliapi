import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import ParkingArea from './parking_area.model.js';

export const PARKING_SLOT_TYPE = Object.freeze({
  TWO_WHEELER: 'two_wheeler',
  FOUR_WHEELER: 'four_wheeler',
  EV_CHARGING: 'ev_charging',
  VISITOR: 'visitor',
  ACCESSIBLE: 'accessible',
});

export const PARKING_SLOT_STATUS = Object.freeze({
  AVAILABLE: 'available',
  ALLOCATED: 'allocated',
  BLOCKED: 'blocked',
  MAINTENANCE: 'maintenance',
});

const ParkingSlot = sequelize.define('ParkingSlot', {
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
  area_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ParkingArea,
      key: 'id',
    },
  },
  slot_number: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  slot_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'four_wheeler',
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'available',
  },
  is_covered: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  has_ev_charger: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  charger_power_kw: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  is_reserved: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  updated_by: {
    type: DataTypes.BIGINT,
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
  tableName: 'parking_slots',
});

ParkingSlot.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyProfile.hasMany(ParkingSlot, { foreignKey: 'society_id', as: 'parkingSlots' });

ParkingSlot.belongsTo(ParkingArea, { foreignKey: 'area_id', as: 'area' });
ParkingArea.hasMany(ParkingSlot, { foreignKey: 'area_id', as: 'slots' });

export default ParkingSlot;
