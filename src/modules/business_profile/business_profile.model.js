import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

const BusinessProfile = sequelize.define('BusinessProfile', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  // Maps JS 'userId' → DB column 'user_id' to match existing table
  userId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true,
    field: 'user_id',   // ← THIS is the critical fix
    references: {
      model: User,
      key: 'userId',
    }
  },
  businessName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'business_name',
  },
  operatingHours: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  bannerUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  serviceCategory: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  hourlyRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  availabilityDays: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'business_profiles',
});

// Setup relationships
BusinessProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasOne(BusinessProfile, { foreignKey: 'userId', as: 'businessProfile' });

export default BusinessProfile;
