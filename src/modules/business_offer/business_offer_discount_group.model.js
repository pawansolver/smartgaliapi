import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessOffer from './business_offer.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

/**
 * Represents one discount rule / group inside an Offer Campaign.
 * Example: Campaign "Nike Festive Sale" ->
 *   Group A: Footwear (20% OFF, max ₹500)
 *   Group B: T-Shirts (30% OFF)
 *   Group C: Bags (Flat ₹200 OFF)
 */
const BusinessOfferDiscountGroup = sequelize.define(
  'BusinessOfferDiscountGroup',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    offer_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: BusinessOffer,
        key: 'id',
      },
    },
    business_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: BusinessProfile,
        key: 'id',
      },
    },
    group_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      defaultValue: 'Default Offer Rule',
    },
    scope_type: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'ENTIRE_STORE', // ENTIRE_STORE | SELECTED_CATEGORIES | SELECTED_PRODUCTS | SELECTED_VARIANTS
    },
    discount_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'percentage', // percentage | flat
    },
    discount_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    max_discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    min_order_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    dynamic_include_new: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    ...commonFields,
  },
  {
    timestamps: false,
    tableName: 'business_offer_discount_groups',
    indexes: [
      { fields: ['offer_id', 'is_deleted'] },
      { fields: ['business_id', 'scope_type'] },
    ],
  }
);

BusinessOffer.hasMany(BusinessOfferDiscountGroup, {
  foreignKey: 'offer_id',
  as: 'discount_groups',
  onDelete: 'CASCADE',
});
BusinessOfferDiscountGroup.belongsTo(BusinessOffer, {
  foreignKey: 'offer_id',
  as: 'offer',
});

export default BusinessOfferDiscountGroup;

