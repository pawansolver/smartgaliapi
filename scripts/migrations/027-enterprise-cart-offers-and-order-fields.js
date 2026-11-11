import sequelize from '../../src/config/db.js';
import { DataTypes } from 'sequelize';

export const version = '027-enterprise-cart-offers-and-order-fields';

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

const removeColumnIfExists = async (queryInterface, table, column) => {
  try {
    const desc = await queryInterface.describeTable(table);
    if (desc[column]) {
      await queryInterface.removeColumn(table, column);
      console.log(`  Removed column ${column} from ${table}`);
    }
  } catch (err) {
    console.warn(`  [WARN] removeColumn ${column} on ${table}:`, err.message);
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log(`[${version}] UP...`);

  await ensureColumn(queryInterface, 'business_offers', 'promo_code', {
    type: DataTypes.STRING(50),
    allowNull: true,
  });
  await ensureColumn(queryInterface, 'business_offers', 'discount_type', {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'percentage',
  });
  await ensureColumn(queryInterface, 'business_offers', 'discount_percent', {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  });
  await ensureColumn(queryInterface, 'business_offers', 'max_discount_amount', {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  });
  await ensureColumn(queryInterface, 'business_offers', 'min_order_amount', {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0.0,
  });

  await ensureColumn(queryInterface, 'business_orders', 'offer_id', {
    type: DataTypes.BIGINT,
    allowNull: true,
  });
  await ensureColumn(queryInterface, 'business_orders', 'promo_code', {
    type: DataTypes.STRING(50),
    allowNull: true,
  });
  await ensureColumn(queryInterface, 'business_orders', 'bulk_discount', {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0.0,
  });
  await ensureColumn(queryInterface, 'business_orders', 'tax_breakdown', {
    type: DataTypes.JSON,
    allowNull: true,
  });
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log(`[${version}] DOWN...`);

  await removeColumnIfExists(queryInterface, 'business_orders', 'tax_breakdown');
  await removeColumnIfExists(queryInterface, 'business_orders', 'bulk_discount');
  await removeColumnIfExists(queryInterface, 'business_orders', 'promo_code');
  await removeColumnIfExists(queryInterface, 'business_orders', 'offer_id');

  await removeColumnIfExists(queryInterface, 'business_offers', 'min_order_amount');
  await removeColumnIfExists(queryInterface, 'business_offers', 'max_discount_amount');
  await removeColumnIfExists(queryInterface, 'business_offers', 'discount_percent');
  await removeColumnIfExists(queryInterface, 'business_offers', 'discount_type');
  await removeColumnIfExists(queryInterface, 'business_offers', 'promo_code');
};

