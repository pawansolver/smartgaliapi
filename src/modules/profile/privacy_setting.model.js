import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

/**
 * PrivacySetting — one row per user (1:1) for the "Privacy Settings" screen.
 */
const PrivacySetting = sequelize.define('PrivacySetting', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true,
    references: { model: User, key: 'userId' },
  },
  // Who can see the user's profile
  profile_visibility: {
    type: DataTypes.ENUM('public', 'members_only'),
    defaultValue: 'public',
  },
  // Show online/active status to others
  show_activity_status: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'privacy_settings',
});

PrivacySetting.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasOne(PrivacySetting, { foreignKey: 'user_id', as: 'privacySetting' });

export default PrivacySetting;
