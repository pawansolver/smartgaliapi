import sequelize from '../../src/config/db.js';
import { DataTypes } from 'sequelize';

export const version = '026-business-orders-and-items';

const ensureColumn = async (queryInterface, table, column, definition) => {
  try {
    const desc = await queryInterface.describeTable(table);
    if (!desc[column]) {
      await queryInterface.addColumn(table, column, definition);
      console.log(`  Added column ${column} to ${table}`);
    }
  } catch (err) {
    console.warn(`  [WARN] ensureColumn ${column} on ${table}:`, err.message);
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[026-business-orders-and-items] UP...');
  const tables = (await queryInterface.showAllTables()).map((t) =>
    typeof t === 'string' ? t : t.tableName || t.table_name
  );

  if (!tables.includes('business_orders')) {
    await queryInterface.createTable('business_orders', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      order_number: { type: DataTypes.STRING(50), allowNull: false, unique: true },
      business_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'business_profiles', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      customer_user_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'userId' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      customer_name: { type: DataTypes.STRING(255), allowNull: false },
      customer_phone: { type: DataTypes.STRING(20), allowNull: false },
      customer_email: { type: DataTypes.STRING(255), allowNull: true },
      customer_address: { type: DataTypes.TEXT, allowNull: true },
      delivery_type: { type: DataTypes.STRING(30), defaultValue: 'home_delivery' },
      payment_mode: { type: DataTypes.STRING(30), defaultValue: 'cod' },
      payment_status: { type: DataTypes.STRING(30), defaultValue: 'pending' },
      status: { type: DataTypes.STRING(30), defaultValue: 'new' },
      subtotal: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
      delivery_fee: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
      packaging_fee: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
      discount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
      tax_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
      total_amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
      latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
      longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
      estimated_delivery_minutes: { type: DataTypes.INTEGER, allowNull: true },
      timeline: { type: DataTypes.JSON, allowNull: true },
      special_instructions: { type: DataTypes.TEXT, allowNull: true },
      cancellation_reason: { type: DataTypes.TEXT, allowNull: true },
      rejection_reason: { type: DataTypes.TEXT, allowNull: true },
      return_reason: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      remark: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: true },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: true },
      deletedRemarks: { type: DataTypes.TEXT, allowNull: true },
    });
    await queryInterface.addIndex('business_orders', ['business_id']);
    await queryInterface.addIndex('business_orders', ['customer_user_id']);
    await queryInterface.addIndex('business_orders', ['status']);
    await queryInterface.addIndex('business_orders', ['business_id', 'status']);
    await queryInterface.addIndex('business_orders', ['business_id', 'created_at']);
    console.log('  Created table business_orders');
  } else {
    await ensureColumn(queryInterface, 'business_orders', 'packaging_fee', { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 });
    await ensureColumn(queryInterface, 'business_orders', 'latitude', { type: DataTypes.DECIMAL(10, 8), allowNull: true });
    await ensureColumn(queryInterface, 'business_orders', 'longitude', { type: DataTypes.DECIMAL(11, 8), allowNull: true });
    await ensureColumn(queryInterface, 'business_orders', 'estimated_delivery_minutes', { type: DataTypes.INTEGER, allowNull: true });
  }

  if (!tables.includes('business_order_items')) {
    await queryInterface.createTable('business_order_items', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      order_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'business_orders', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      business_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'business_profiles', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      product_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'business_products', key: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      variant_id: { type: DataTypes.STRING(100), allowNull: true },
      variant_name: { type: DataTypes.STRING(255), allowNull: true },
      product_name: { type: DataTypes.STRING(255), allowNull: false },
      sku: { type: DataTypes.STRING(100), allowNull: true },
      image: { type: DataTypes.STRING(1000), allowNull: true },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      mrp: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.0 },
      unit_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.0 },
      total_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.0 },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_by: { type: DataTypes.BIGINT, allowNull: true },
      updated_by: { type: DataTypes.BIGINT, allowNull: true },
      remark: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: true },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: true },
      deletedRemarks: { type: DataTypes.TEXT, allowNull: true },
    });
    await queryInterface.addIndex('business_order_items', ['order_id']);
    await queryInterface.addIndex('business_order_items', ['business_id']);
    await queryInterface.addIndex('business_order_items', ['product_id']);
    console.log('  Created table business_order_items');
  }
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  await queryInterface.dropTable('business_order_items');
  await queryInterface.dropTable('business_orders');
};

