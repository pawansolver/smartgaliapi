import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import BusinessProduct from './business_product.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

const ProductInventoryMovement = sequelize.define('ProductInventoryMovement', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  product_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: BusinessProduct,
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
  previous_quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  new_quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  adjustment_quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  reason: {
    type: DataTypes.STRING(100),
    allowNull: false, // 'initial_stock', 'restock', 'correction', 'damaged', 'returned', 'customer_order', 'order_cancelled'
  },
  performed_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  order_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
}, {
  timestamps: false,
  tableName: 'product_inventory_movements',
  indexes: [
    { fields: ['product_id'] },
    { fields: ['business_id'] },
    { fields: ['timestamp'] },
  ],
});

ProductInventoryMovement.belongsTo(BusinessProduct, { foreignKey: 'product_id', as: 'product' });
BusinessProduct.hasMany(ProductInventoryMovement, { foreignKey: 'product_id', as: 'inventory_movements' });

export default ProductInventoryMovement;

