import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import BusinessCategory from '../business_category/business_category.model.js';

const parseJsonField = (field, defaultVal) => function () {
  const v = this.getDataValue(field);
  if (v === null || v === undefined) return defaultVal;
  if (typeof v === 'object') return v;
  try {
    const parsed = JSON.parse(v);
    return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
  } catch {
    return defaultVal;
  }
};

const stringifyJsonField = (field, defaultJson = '[]') => function (v) {
  if (v === null || v === undefined) {
    this.setDataValue(field, null);
  } else if (typeof v === 'object') {
    this.setDataValue(field, JSON.stringify(v));
  } else if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) {
      this.setDataValue(field, defaultJson);
      return;
    }
    try {
      JSON.parse(trimmed);
      this.setDataValue(field, trimmed);
    } catch {
      this.setDataValue(field, JSON.stringify([trimmed]));
    }
  } else {
    this.setDataValue(field, JSON.stringify(v));
  }
};

const BusinessProduct = sequelize.define('BusinessProduct', {
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
    },
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  brand: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  category_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: BusinessCategory,
      key: 'id',
    },
  },
  category_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  subcategory_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  subcategory_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  product_type: {
    type: DataTypes.STRING(50),
    defaultValue: 'Physical',
  },
  sku: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  short_description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  detailed_description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  tags: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]',
    get: parseJsonField('tags', []),
    set: stringifyJsonField('tags'),
  },
  search_keywords: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]',
    get: parseJsonField('search_keywords', []),
    set: stringifyJsonField('search_keywords'),
  },
  unit: {
    type: DataTypes.STRING(50),
    defaultValue: 'Piece',
  },

  // Step 2: Media
  primary_image: {
    type: DataTypes.STRING(1000),
    allowNull: true,
  },
  images: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]',
    get: parseJsonField('images', []),
    set: stringifyJsonField('images'),
  },
  video_url: {
    type: DataTypes.STRING(1000),
    allowNull: true,
  },

  // Category Specifications & Custom Attributes
  attributes: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '{}',
    get: parseJsonField('attributes', {}),
    set: stringifyJsonField('attributes'),
  },

  // Step 3: Pricing & Tax
  mrp: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  selling_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
  },
  cost_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  discount_type: {
    type: DataTypes.STRING(20),
    defaultValue: 'percentage', // 'percentage' | 'fixed'
  },
  discount_value: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  gst_slab: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00,
  },
  tax_inclusive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  hsn_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  min_selling_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  profit_margin: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },

  // Step 4: Inventory & Stock Management
  track_inventory: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  available_quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  low_stock_threshold: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
  },
  max_stock_capacity: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  reserved_quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  allow_backorder: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  stock_status: {
    type: DataTypes.STRING(30),
    defaultValue: 'in_stock', // 'in_stock', 'low_stock', 'out_of_stock'
  },
  store_warehouse: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  stock_management_mode: {
    type: DataTypes.STRING(50),
    defaultValue: 'Standard',
  },

  // Step 5: Product Variants
  has_variants: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  variants: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]',
    get: parseJsonField('variants', []),
    set: stringifyJsonField('variants'),
  },

  // Step 6: Delivery & Fulfilment
  home_delivery: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  store_pickup: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  delivery_charge: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  free_delivery_above: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  min_order_quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  max_order_quantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  prep_time_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 30,
  },
  delivery_time_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 60,
  },
  packaging_charge: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00,
  },
  cash_on_delivery: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  delivery_coverage: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '{}',
    get: parseJsonField('delivery_coverage', {}),
    set: stringifyJsonField('delivery_coverage'),
  },

  // Step 7: Compliance & Product Details
  barcode: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  batch_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  mfg_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  shelf_life: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  storage_instructions: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  country_of_origin: {
    type: DataTypes.STRING(100),
    defaultValue: 'India',
  },
  manufacturer_details: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  fssai_license: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },

  // Step 8: Offers & Advanced Selling
  bulk_pricing: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]',
    get: parseJsonField('bulk_pricing', []),
    set: stringifyJsonField('bulk_pricing'),
  },
  is_featured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  is_bestseller: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  is_returnable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  return_window_days: {
    type: DataTypes.INTEGER,
    defaultValue: 7,
  },
  replacement_policy: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  warranty_details: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  care_instructions: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  disclaimer: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // Workflow & Moderation
  status: {
    type: DataTypes.STRING(30),
    defaultValue: 'draft', // 'draft', 'active', 'paused', 'archived'
  },
  approval_status: {
    type: DataTypes.STRING(30),
    defaultValue: 'pending', // 'pending', 'approved', 'rejected'
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  approval_history: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: '[]',
    get: parseJsonField('approval_history', []),
    set: stringifyJsonField('approval_history'),
  },

  ...commonFields,
}, {
  timestamps: false,
  tableName: 'business_products',
  indexes: [
    {
      name: 'uq_business_products_business_sku',
      unique: true,
      fields: ['business_id', 'sku'],
    },
    {
      name: 'idx_business_products_listing',
      fields: ['business_id', 'is_deleted', 'status', 'created_at'],
    },
    {
      name: 'idx_business_products_search',
      fields: ['business_id', 'is_deleted', 'name'],
    },
    { fields: ['business_id'] },
    { fields: ['sku'] },
    { fields: ['status'] },
    { fields: ['category_id'] },
    { fields: ['stock_status'] },
  ],
});

// Relationships
BusinessProduct.belongsTo(BusinessProfile, { foreignKey: 'business_id', as: 'business' });
BusinessProfile.hasMany(BusinessProduct, { foreignKey: 'business_id', as: 'products' });

BusinessProduct.belongsTo(BusinessCategory, { foreignKey: 'category_id', as: 'category' });

export default BusinessProduct;
