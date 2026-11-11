import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessOrder from './business_order.model.js';
import BusinessProduct from '../business_product/business_product.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

const BusinessOrderItem = sequelize.define('BusinessOrderItem', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  order_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: BusinessOrder,
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
  product_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: BusinessProduct,
      key: 'id',
    },
  },
  variant_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  variant_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  product_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  sku: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  image: {
    type: DataTypes.STRING(1000),
    allowNull: true,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  mrp: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  original_unit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  offer_discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  applied_offer_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  applied_group_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  applied_offer_title: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  applied_offer_snapshot: {
    type: DataTypes.JSON,
    allowNull: true,
    get() {
      const v = this.getDataValue('applied_offer_snapshot');
      if (v && typeof v === 'object') return v;
      if (!v) return null;
      try {
        const parsed = JSON.parse(v);
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    },
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'business_order_items',
  indexes: [
    { fields: ['order_id'] },
    { fields: ['business_id'] },
    { fields: ['product_id'] },
  ],
});

BusinessOrder.hasMany(BusinessOrderItem, { foreignKey: 'order_id', as: 'items', onDelete: 'CASCADE' });
BusinessOrderItem.belongsTo(BusinessOrder, { foreignKey: 'order_id', as: 'order' });
BusinessOrderItem.belongsTo(BusinessProduct, { foreignKey: 'product_id', as: 'product' });

export default BusinessOrderItem;

