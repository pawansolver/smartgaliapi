import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';

/**
 * UserDevice — FCM push registration per physical/logical device.
 *
 * Uniqueness: (user_id, device_id) so one user may have many devices
 * (Android + iOS + tablet) without duplicate rows for the same device.
 *
 * push_token is NOT unique: token rotation and reinstalls must not collide.
 */
const UserDevice = sequelize.define(
  'UserDevice',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: User, key: 'userId' },
    },
    device_id: {
      type: DataTypes.STRING(128),
      allowNull: false,
      comment: 'Stable client-generated device identifier',
    },
    platform: {
      type: DataTypes.ENUM('android', 'ios', 'web'),
      allowNull: false,
    },
    push_token: {
      type: DataTypes.STRING(512),
      allowNull: false,
      comment: 'FCM registration token (sensitive; mask in logs)',
    },
    app_version: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    device_model: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    last_seen_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deactivated_reason: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
  },
  {
    tableName: 'user_devices',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  },
);

User.hasMany(UserDevice, { foreignKey: 'user_id', as: 'devices' });
UserDevice.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default UserDevice;
