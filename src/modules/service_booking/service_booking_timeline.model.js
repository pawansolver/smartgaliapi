import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const ServiceBookingTimeline = sequelize.define('ServiceBookingTimeline', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  booking_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  actor_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  actor_role: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Explicit column mappings required when timestamps: false but columns exist
  created_at: {
    type: DataTypes.DATE,
    field: 'created_at',
    defaultValue: DataTypes.NOW,
    allowNull: true,
  },
  updated_at: {
    type: DataTypes.DATE,
    field: 'updated_at',
    defaultValue: DataTypes.NOW,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'service_booking_timelines',
  underscored: true,
});

export default ServiceBookingTimeline;