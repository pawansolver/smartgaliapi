import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessOffer from './business_offer.model.js';
import BusinessOfferDiscountGroup from './business_offer_discount_group.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

/**
 * Target mapping rows linking an offer campaign / discount group to:
 * - CATEGORY (category_id / category_name)
 * - PRODUCT (product_id)
 * - VARIANT (product_id + variant_id / variant_label)
 * Also supports explicit exclusions (is_excluded = true).
 */
const BusinessOfferTarget = sequelize.define(
  'BusinessOfferTarget',
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
    group_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: BusinessOfferDiscountGroup,
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
    target_type: {
      type: DataTypes.STRING(24),
      allowNull: false, // CATEGORY | PRODUCT | VARIANT
    },
    category_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    category_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    product_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    variant_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    variant_label: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    is_excluded: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    ...commonFields,
  },
  {
    timestamps: false,
    tableName: 'business_offer_targets',
    indexes: [
      { fields: ['offer_id', 'is_deleted'] },
      { fields: ['group_id', 'is_deleted'] },
      { fields: ['business_id', 'target_type', 'is_deleted'] },
      { fields: ['category_id'] },
      { fields: ['product_id'] },
    ],
  }
);

BusinessOffer.hasMany(BusinessOfferTarget, {
  foreignKey: 'offer_id',
  as: 'targets',
  onDelete: 'CASCADE',
});
BusinessOfferDiscountGroup.hasMany(BusinessOfferTarget, {
  foreignKey: 'group_id',
  as: 'targets',
  onDelete: 'CASCADE',
});
BusinessOfferTarget.belongsTo(BusinessOffer, {
  foreignKey: 'offer_id',
  as: 'offer',
});
BusinessOfferTarget.belongsTo(BusinessOfferDiscountGroup, {
  foreignKey: 'group_id',
  as: 'group',
});

export default BusinessOfferTarget;

