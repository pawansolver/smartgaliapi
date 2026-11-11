import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import BusinessCategory from '../business_category/business_category.model.js';
import BusinessCoverageArea from './business_coverage_area.model.js';
import SocietyBusinessAccess from './society_business_access.model.js';

const BusinessProfile = sequelize.define(
  'BusinessProfile',
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.BIGINT,
      field: 'user_id',
      allowNull: true,
    },
    businessName: {
      type: DataTypes.STRING(150),
      field: 'business_name',
      allowNull: true,
    },
    category_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    serviceCategory: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    logo_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    bannerUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    operatingHours: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    hourlyRate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    availabilityDays: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    state_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    district_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    city_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    city_name: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    locality_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    locality_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    pincode_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    pincode: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    society_id: {
      type: DataTypes.BIGINT,
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
    coverage_scope: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'PUBLIC',
    },
    default_radius_km: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: false,
      defaultValue: 10.0,
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_featured: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_open: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ...commonFields,
  },
  {
    timestamps: false,
    tableName: 'business_profiles',
  }
);

BusinessProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasOne(BusinessProfile, { foreignKey: 'userId', as: 'businessProfile' });

BusinessProfile.belongsTo(BusinessCategory, {
  foreignKey: 'category_id',
  as: 'category',
});

BusinessProfile.hasMany(BusinessCoverageArea, {
  foreignKey: 'business_id',
  as: 'coverageAreas',
});
BusinessCoverageArea.belongsTo(BusinessProfile, {
  foreignKey: 'business_id',
  as: 'business',
});

BusinessProfile.hasMany(SocietyBusinessAccess, {
  foreignKey: 'business_id',
  as: 'societyAccesses',
});
SocietyBusinessAccess.belongsTo(BusinessProfile, {
  foreignKey: 'business_id',
  as: 'business',
});

export default BusinessProfile;
