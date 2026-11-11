/**
 * Idempotent Enterprise Bulk Offer Management Migration (MariaDB / MySQL InnoDB)
 * Run with: node src/database/migrations/add_enterprise_bulk_offer_system.js
 *
 * Adds:
 *  1. Campaign scope, application_mode, conflict_policy, priority, stackable,
 *     dynamic_include_new, banner_badge columns on `business_offers`
 *  2. Normalized `business_offer_discount_groups` table (multi-rule campaigns)
 *  3. Normalized `business_offer_targets` table (CATEGORY | PRODUCT | VARIANT + exclusions)
 *  4. Immutable offer snapshot & auto_offer_discount columns on `business_orders` & `business_order_items`
 */
import sequelize from '../../config/db.js';
import BusinessOffer from '../../modules/business_offer/business_offer.model.js';
import BusinessOfferDiscountGroup from '../../modules/business_offer/business_offer_discount_group.model.js';
import BusinessOfferTarget from '../../modules/business_offer/business_offer_target.model.js';

const hasColumn = async (tableName, columnName) => {
  const [rows] = await sequelize.query(
    `SHOW COLUMNS FROM \`${tableName}\` LIKE ?`,
    { replacements: [columnName] }
  );
  return rows.length > 0;
};

const ensureColumn = async (tableName, columnName, ddl) => {
  const exists = await hasColumn(tableName, columnName);
  if (exists) {
    console.log(`  - [SKIP] ${tableName}.${columnName} already exists`);
    return false;
  }
  await sequelize.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${ddl}`);
  console.log(`  + [OK]   Added ${tableName}.${columnName}`);
  return true;
};

const hasIndex = async (tableName, indexName) => {
  const [rows] = await sequelize.query(
    `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`,
    { replacements: [indexName] }
  );
  return rows.length > 0;
};

const ensureIndex = async (tableName, indexName, ddl) => {
  const exists = await hasIndex(tableName, indexName);
  if (exists) {
    console.log(`  - [SKIP] ${tableName}.${indexName} already exists`);
    return false;
  }
  await sequelize.query(ddl);
  console.log(`  + [OK]   Created ${tableName}.${indexName}`);
  return true;
};

export const runEnterpriseBulkOfferMigration = async () => {
  console.log('Running Enterprise Bulk Offer Management migration...');

  // 1. Extend business_offers header columns
  await ensureColumn(
    'business_offers',
    'campaign_scope',
    "VARCHAR(32) NOT NULL DEFAULT 'ENTIRE_STORE'"
  );
  await ensureColumn(
    'business_offers',
    'application_mode',
    "VARCHAR(20) NOT NULL DEFAULT 'COUPON'"
  );
  await ensureColumn(
    'business_offers',
    'conflict_policy',
    "VARCHAR(32) NOT NULL DEFAULT 'HIGHEST_DISCOUNT'"
  );
  await ensureColumn('business_offers', 'priority', 'INT NOT NULL DEFAULT 10');
  await ensureColumn('business_offers', 'stackable', 'TINYINT(1) NOT NULL DEFAULT 0');
  await ensureColumn('business_offers', 'dynamic_include_new', 'TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn('business_offers', 'banner_badge', 'VARCHAR(80) NULL');

  await ensureIndex(
    'business_offers',
    'idx_bo_biz_active_mode',
    'CREATE INDEX idx_bo_biz_active_mode ON business_offers (business_id, is_active, is_deleted, application_mode)'
  );

  // 2. Sync normalized child tables
  await BusinessOfferDiscountGroup.sync();
  await BusinessOfferTarget.sync();
  console.log('  + [OK]   Synced business_offer_discount_groups & business_offer_targets tables');

  // 3. Extend business_orders & business_order_items with immutable snapshots
  await ensureColumn(
    'business_orders',
    'auto_offer_discount',
    'DECIMAL(10, 2) NOT NULL DEFAULT 0.00'
  );
  await ensureColumn(
    'business_orders',
    'applied_offer_snapshot',
    'LONGTEXT NULL'
  );

  await ensureColumn(
    'business_order_items',
    'original_unit_price',
    'DECIMAL(10, 2) NULL'
  );
  await ensureColumn(
    'business_order_items',
    'offer_discount_amount',
    'DECIMAL(10, 2) NOT NULL DEFAULT 0.00'
  );
  await ensureColumn('business_order_items', 'applied_offer_id', 'BIGINT NULL');
  await ensureColumn('business_order_items', 'applied_group_id', 'BIGINT NULL');
  await ensureColumn('business_order_items', 'applied_offer_title', 'VARCHAR(255) NULL');
  await ensureColumn('business_order_items', 'applied_offer_snapshot', 'LONGTEXT NULL');

  // 4. Backfill missing discount_groups row for legacy active business_offers rows
  const [legacyOffers] = await sequelize.query(`
    SELECT bo.*
    FROM business_offers bo
    LEFT JOIN business_offer_discount_groups dg
      ON dg.offer_id = bo.id AND dg.is_deleted = 0
    WHERE bo.is_deleted = 0 AND dg.id IS NULL
  `);

  for (const row of legacyOffers) {
    const discountType =
      String(row.discount_type || '').toLowerCase() === 'flat' ? 'flat' : 'percentage';
    const rawNumeric =
      row.discount_percent != null
        ? Number(row.discount_percent)
        : Number(String(row.discount || '').match(/(\d+(?:\.\d+)?)/)?.[1] || 0);
    await BusinessOfferDiscountGroup.create({
      offer_id: row.id,
      business_id: row.business_id,
      group_name: row.title || 'Storewide Offer Rule',
      scope_type: 'ENTIRE_STORE',
      discount_type: discountType,
      discount_value: Number.isFinite(rawNumeric) ? rawNumeric : 0,
      max_discount_amount: row.max_discount_amount != null ? Number(row.max_discount_amount) : null,
      min_order_amount: Number(row.min_order_amount || 0),
      dynamic_include_new: true,
      priority: Number(row.priority || 10),
      display_order: 0,
    });
  }
  console.log(`  + [OK]   Backfilled ${legacyOffers.length} legacy offers with default discount group`);
  console.log('Enterprise Bulk Offer Management migration complete!');
};

const invokedDirectly =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (invokedDirectly) {
  runEnterpriseBulkOfferMigration()
    .then(async () => {
      await sequelize.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await sequelize.close();
      process.exit(1);
    });
}

