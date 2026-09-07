import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

const Role = sequelize.define('Role', {
  roleId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  role_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
  },
  roleName: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  roleDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  scope: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'platform',
  },
  is_system_role: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  ...commonFields,
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'roles',
});

export default Role;
