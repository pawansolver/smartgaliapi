import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const SocietyGate = sequelize.define('SocietyGate', {
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
  gate_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  gate_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  gate_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'main',
  },
  location: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  operating_hours: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: '24/7',
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'maintenance'),
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
  tableName: 'society_gates',
  timestamps: false,
});

SocietyGate.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });

export default SocietyGate;
