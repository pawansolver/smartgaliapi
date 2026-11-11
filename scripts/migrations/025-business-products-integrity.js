import sequelize from '../../src/config/db.js';
import { DataTypes } from 'sequelize';

export const version = '025-business-products-integrity';

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

const ensureIndex = async (queryInterface, table, fields, name, options = {}) => {
  try {
    const indexes = await queryInterface.showIndex(table);
    const exists = indexes.some((idx) => idx.name === name);
    if (!exists) {
      await queryInterface.addIndex(table, fields, { name, ...options });
      console.log(`  Added index ${name} on ${table}`);
    } else {
      console.log(`  Index ${name} already exists on ${table}`);
    }
  } catch (err) {
    console.warn(`  [WARN] ensureIndex ${name} on ${table}:`, err.message);
  }
};

const removeIndexIfExists = async (queryInterface, table, name) => {
  try {
    const indexes = await queryInterface.showIndex(table);
    const exists = indexes.some((idx) => idx.name === name);
    if (exists) {
      await queryInterface.removeIndex(table, name);
      console.log(`  Removed index ${name} from ${table}`);
    }
  } catch (err) {
    console.warn(`  [WARN] removeIndex ${name} from ${table}:`, err.message);
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[025-business-products-integrity] UP...');

  // 1. Ensure approval_history and rejection_reason columns
  await ensureColumn(queryInterface, 'business_products', 'rejection_reason', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  await ensureColumn(queryInterface, 'business_products', 'approval_history', {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
  });

  // 2. Safely resolve duplicate (business_id, sku) if any exist
  const [duplicates] = await sequelize.query(`
    SELECT business_id, sku, COUNT(*) as cnt
    FROM business_products
    GROUP BY business_id, sku
    HAVING cnt > 1
  `);

  if (duplicates.length > 0) {
    console.log(`  Found ${duplicates.length} duplicate SKU sets. Resolving safely with non-destructive suffixes...`);
    for (const dup of duplicates) {
      const [rows] = await sequelize.query(
        `SELECT id FROM business_products WHERE business_id = ? AND sku = ? ORDER BY id ASC`,
        { replacements: [dup.business_id, dup.sku] }
      );
      for (let i = 1; i < rows.length; i++) {
        const rowId = rows[i].id;
        await sequelize.query(
          `UPDATE business_products SET sku = CONCAT(sku, '-DUP-', id) WHERE id = ?`,
          { replacements: [rowId] }
        );
      }
    }
  }

  // 3. Add composite unique constraint on (business_id, sku)
  await ensureIndex(
    queryInterface,
    'business_products',
    ['business_id', 'sku'],
    'uq_business_products_business_sku',
    { unique: true }
  );

  // 4. Add composite listing index (business_id, is_deleted, status, created_at)
  await ensureIndex(
    queryInterface,
    'business_products',
    ['business_id', 'is_deleted', 'status', 'created_at'],
    'idx_business_products_listing'
  );

  // 5. Add composite search index (business_id, is_deleted, name)
  await ensureIndex(
    queryInterface,
    'business_products',
    ['business_id', 'is_deleted', 'name'],
    'idx_business_products_search'
  );

  console.log('[025-business-products-integrity] UP completed successfully.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[025-business-products-integrity] DOWN...');
  await removeIndexIfExists(queryInterface, 'business_products', 'uq_business_products_business_sku');
  await removeIndexIfExists(queryInterface, 'business_products', 'idx_business_products_listing');
  await removeIndexIfExists(queryInterface, 'business_products', 'idx_business_products_search');
  try {
    await queryInterface.removeColumn('business_products', 'rejection_reason');
    await queryInterface.removeColumn('business_products', 'approval_history');
  } catch (_) {}
  console.log('[025-business-products-integrity] DOWN completed successfully.');
};
