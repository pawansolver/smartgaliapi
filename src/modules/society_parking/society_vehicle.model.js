import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import SocietyMember from '../society_member/society_member.model.js';

export const VEHICLE_CATEGORY = Object.freeze({
  CAR: 'car',
  BIKE: 'bike',
  EV: 'ev',
  SCOOTER: 'scooter',
  SUV: 'suv',
  COMMERCIAL: 'commercial',
});

export const normalizeRegistrationNumber = (plate) => {
  if (!plate) return '';
  return String(plate).trim().toUpperCase().replace(/[\s-]/g, '');
};

const SocietyVehicle = sequelize.define('SocietyVehicle', {
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
  owner_user_id: {
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
  registration_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  normalized_registration: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  vehicle_type: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'car',
  },
  make: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  model: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  color: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  fuel_type: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'Petrol',
  },
  is_ev: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
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
  tableName: 'society_vehicles',
  hooks: {
    beforeValidate: (vehicle) => {
      if (vehicle.registration_number) {
        vehicle.registration_number = vehicle.registration_number.trim().toUpperCase();
        vehicle.normalized_registration = normalizeRegistrationNumber(vehicle.registration_number);
      }
    },
  },
});

SocietyVehicle.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyProfile.hasMany(SocietyVehicle, { foreignKey: 'society_id', as: 'vehicles' });

SocietyVehicle.belongsTo(User, { foreignKey: 'owner_user_id', as: 'owner' });
User.hasMany(SocietyVehicle, { foreignKey: 'owner_user_id', as: 'vehicles' });

SocietyVehicle.belongsTo(SocietyMember, { foreignKey: 'society_member_id', as: 'member' });

export default SocietyVehicle;
