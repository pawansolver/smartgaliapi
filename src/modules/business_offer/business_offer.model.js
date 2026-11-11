import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

const BusinessOffer = sequelize.define('BusinessOffer', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  business_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: BusinessProfile,
      key: 'id',
    }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  discount: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  promo_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  discount_type: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'percentage',
  },
  discount_percent: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  max_discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  min_order_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0.0,
  },
  valid_from: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  valid_to: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  image: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  campaign_scope: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'ENTIRE_STORE', // ENTIRE_STORE | SELECTED_CATEGORIES | SELECTED_PRODUCTS | SELECTED_VARIANTS | MULTI_GROUP
  },
  application_mode: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'AUTO', // AUTO | COUPON
  },
  conflict_policy: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'HIGHEST_DISCOUNT', // HIGHEST_DISCOUNT | PRIORITY | NON_STACKABLE
  },
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10,
  },
  stackable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  dynamic_include_new: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  banner_badge: {
    type: DataTypes.STRING(80),
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'business_offers',
  indexes: [
    { fields: ['business_id', 'is_active', 'is_deleted'] },
    { fields: ['campaign_scope'] },
    { fields: ['application_mode'] },
  ],
});

// Setup relationships
BusinessOffer.belongsTo(BusinessProfile, { foreignKey: 'business_id', as: 'business' });
BusinessProfile.hasMany(BusinessOffer, { foreignKey: 'business_id', as: 'offers' });

export default BusinessOffer;
