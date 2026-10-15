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
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName: 'service_booking_timelines',
});

export default ServiceBookingTimeline;
