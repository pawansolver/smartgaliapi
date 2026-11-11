import sequelize from '../../src/config/db.js';
import { DataTypes } from 'sequelize';

export const version = '026-add-product-attributes-and-media';

const ensureColumn = async (queryInterface, table, column, definition) => {
  try {
    const desc = await queryInterface.describeTable(table);
    if (!desc[column]) {
      await queryInterface.addColumn(table, column, definition);
      console.log(`  Added column ${column} to ${table}`);
    } else {
      console.log(`  Column ${column} already exists on ${table}`);
    }
  } catch (err) {
    console.warn(`  [WARN] ensureColumn ${column} on ${table}:`, err.message);
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[026-add-product-attributes-and-media] UP...');

  // 1. Ensure 'attributes' JSON column for category dynamic specs and custom specifications
  await ensureColumn(queryInterface, 'business_products', 'attributes', {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
  });

  // 2. Ensure standard enterprise e-commerce categories exist in business_categories
  const standardCategories = [
    { name: 'Fashion', icon: 'checkroom' },
    { name: 'Electronics', icon: 'devices' },
    { name: 'Grocery', icon: 'local_grocery_store' },
    { name: 'Furniture', icon: 'chair' },
    { name: 'Beauty', icon: 'spa' },
    { name: 'Footwear', icon: 'roller_skating' },
    { name: 'Hardware', icon: 'build' },
    { name: 'General', icon: 'category' },
  ];

  for (const cat of standardCategories) {
    const [existing] = await sequelize.query(
      'SELECT id FROM business_categories WHERE name = ? AND is_deleted = 0',
      { replacements: [cat.name] }
    );
    if (existing.length === 0) {
      await sequelize.query(
        'INSERT INTO business_categories (name, icon, is_active, is_deleted, created_at, updatedAt) VALUES (?, ?, 1, 0, NOW(), NOW())',
        { replacements: [cat.name, cat.icon] }
      );
      console.log(`  Seeded standard business category: ${cat.name}`);
    } else {
      console.log(`  Category ${cat.name} already exists (ID: ${existing[0].id})`);
    }
  }

  console.log('[026-add-product-attributes-and-media] UP completed successfully.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[026-add-product-attributes-and-media] DOWN...');
  try {
    await queryInterface.removeColumn('business_products', 'attributes');
    console.log('  Removed column attributes from business_products');
  } catch (err) {
    console.warn('  [WARN] removeColumn attributes:', err.message);
  }
  console.log('[026-add-product-attributes-and-media] DOWN completed successfully.');
};

