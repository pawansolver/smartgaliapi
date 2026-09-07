import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import Permission from './permission.model.js';

const UserPermission = sequelize.define('UserPermission', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  permission_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  effect: {
    type: DataTypes.ENUM('ALLOW', 'DENY'),
    allowNull: false,
    defaultValue: 'ALLOW',
  },
  assigned_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  tableName: 'user_permissions',
});

User.hasMany(UserPermission, { foreignKey: 'user_id', as: 'userPermissions' });
UserPermission.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Permission.hasMany(UserPermission, { foreignKey: 'permission_id', as: 'userPermissions' });
UserPermission.belongsTo(Permission, { foreignKey: 'permission_id', as: 'permission' });

export default UserPermission;
