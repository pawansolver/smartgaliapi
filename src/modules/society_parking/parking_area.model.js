import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';

export const PARKING_AREA_STATUS = Object.freeze({
  ACTIVE: 'active',
  MAINTENANCE: 'maintenance',
});

const ParkingArea = sequelize.define('ParkingArea', {
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
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  floor: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  parking_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'Covered Basement',
  },
  total_capacity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 20,
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'active',
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
  tableName: 'parking_areas',
});

ParkingArea.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyProfile.hasMany(ParkingArea, { foreignKey: 'society_id', as: 'parkingAreas' });

export default ParkingArea;
