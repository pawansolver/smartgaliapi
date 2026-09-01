import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

/**
 * UserAddress — saved delivery/home/shop addresses for the "Manage Addresses" screen.
 * A user can have many addresses; exactly one can be flagged as default.
 */
const UserAddress = sequelize.define('UserAddress', {
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
  // UI label — Home / Shop / Other
  label: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Home',
  },
  house_no: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  street: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  landmark: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // Pre-composed, display-ready address string
  full_address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  is_default: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'user_addresses',
});

UserAddress.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(UserAddress, { foreignKey: 'user_id', as: 'addresses' });

export default UserAddress;
