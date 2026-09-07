import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import Role from '../role/role.model.js';
import Permission from './permission.model.js';

const RolePermission = sequelize.define('RolePermission', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  role_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  permission_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  tableName: 'role_permissions',
});

Role.hasMany(RolePermission, { foreignKey: 'role_id', as: 'rolePermissions' });
RolePermission.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

Permission.hasMany(RolePermission, { foreignKey: 'permission_id', as: 'rolePermissions' });
RolePermission.belongsTo(Permission, { foreignKey: 'permission_id', as: 'permission' });

Role.belongsToMany(Permission, {
  through: RolePermission,
  foreignKey: 'role_id',
  otherKey: 'permission_id',
  as: 'permissions',
});
Permission.belongsToMany(Role, {
  through: RolePermission,
  foreignKey: 'permission_id',
  otherKey: 'role_id',
  as: 'roles',
});

export default RolePermission;
