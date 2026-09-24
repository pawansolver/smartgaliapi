import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';

export const SocietyShift = sequelize.define('SocietyShift', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: SocietyProfile, key: 'id' },
  },
  shift_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  start_time: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: '07:00',
  },
  end_time: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: '19:00',
  },
  break_start: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  break_end: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  weekly_off: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: 'Sunday',
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'active',
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
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'society_shifts',
  timestamps: false,
});

SocietyShift.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });

export default SocietyShift;
