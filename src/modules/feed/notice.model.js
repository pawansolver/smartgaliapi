import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';

/**
 * Notice Model — Hyperlocal neighborhood alert card (top green card in UI)
 * Admin/society posts emergency or scheduled notices geo-targeted to a radius.
 */
const Notice = sequelize.define('Notice', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  // e.g. "tomorrow from 10:00 AM to 12:00 PM"
  scheduledTime: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'scheduled_time',
  },
  // Center lat/lng of the area this notice targets
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  // radius in km within which this notice is visible (default 5 km)
  radiusKm: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 5.00,
    field: 'radius_km',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: User, key: 'userId' },
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: true,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'notices',
});

Notice.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

export default Notice;
