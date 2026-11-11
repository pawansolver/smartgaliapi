import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessProfile from './business_profile.model.js';
import User from '../user/user.model.js';

const BusinessFollow = sequelize.define(
  'BusinessFollow',
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    business_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    notify_updates: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ...commonFields,
  },
  {
    tableName: 'business_follows',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['business_id', 'user_id'],
        name: 'uq_business_follow_pair',
      },
      {
        fields: ['business_id'],
        name: 'ix_business_follow_business_id',
      },
      {
        fields: ['user_id'],
        name: 'ix_business_follow_user_id',
      },
    ],
  }
);

BusinessFollow.belongsTo(BusinessProfile, { foreignKey: 'business_id', as: 'business' });
BusinessProfile.hasMany(BusinessFollow, { foreignKey: 'business_id', as: 'followers' });

BusinessFollow.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default BusinessFollow;

