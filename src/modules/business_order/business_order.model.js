import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import User from '../user/user.model.js';

const parseTimeline = function () {
  const v = this.getDataValue('timeline');
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseTaxBreakdown = function () {
  const v = this.getDataValue('tax_breakdown');
  if (v && typeof v === 'object') return v;
  if (!v) return null;
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const parseOfferSnapshot = function () {
  const v = this.getDataValue('applied_offer_snapshot');
  if (v && typeof v === 'object') return v;
  if (!v) return null;
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const BusinessOrder = sequelize.define('BusinessOrder', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  order_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  business_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: BusinessProfile,
      key: 'id',
    },
  },
  customer_user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  customer_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  customer_phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
  },
  customer_email: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  customer_address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  delivery_type: {
    type: DataTypes.STRING(30),
    defaultValue: 'home_delivery', // 'home_delivery', 'store_pickup'
  },
  payment_mode: {
    type: DataTypes.STRING(30),
    defaultValue: 'cod', // 'cod', 'prepaid', 'upi', 'card'
  },
  payment_status: {
    type: DataTypes.STRING(30),
    defaultValue: 'pending', // 'pending', 'completed', 'failed', 'refunded'
  },
  status: {
    type: DataTypes.STRING(30),
    defaultValue: 'new', // 'new', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled', 'returned', 'refunded'
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  delivery_fee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  packaging_fee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  offer_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  promo_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  auto_offer_discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  applied_offer_snapshot: {
    type: DataTypes.JSON,
    allowNull: true,
    get: parseOfferSnapshot,
  },
  bulk_discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  tax_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  tax_breakdown: {
    type: DataTypes.JSON,
    allowNull: true,
    get: parseTaxBreakdown,
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  estimated_delivery_minutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  timeline: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    get: parseTimeline,
  },
  special_instructions: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  cancellation_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  return_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'business_orders',
  indexes: [
    { fields: ['order_number'], unique: true },
    { fields: ['business_id'] },
    { fields: ['customer_user_id'] },
    { fields: ['status'] },
    { fields: ['business_id', 'status'] },
    { fields: ['business_id', 'created_at'] },
  ],
});

// Relationships
BusinessOrder.belongsTo(BusinessProfile, { foreignKey: 'business_id', as: 'business' });
BusinessProfile.hasMany(BusinessOrder, { foreignKey: 'business_id', as: 'orders' });

BusinessOrder.belongsTo(User, { foreignKey: 'customer_user_id', as: 'customer' });

export default BusinessOrder;

