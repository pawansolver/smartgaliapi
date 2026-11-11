/**
 * Idempotent Enterprise Search Infrastructure Migration (MariaDB / MySQL InnoDB)
 * Run with: node src/database/migrations/add_enterprise_search_infrastructure.js
 *
 * Adds:
 *  1. `business_search_synonyms` + default English & Hinglish seed data
 *  2. `business_search_logs` for resident query & zero-result analytics
 *  3. InnoDB FULLTEXT indexes on `business_products` and `business_profiles`
 *  4. Composite geo/active indexes on `business_products` and `business_profiles`
 */
import sequelize from '../../config/db.js';
import '../../modules/business_category/business_category.model.js';
import BusinessSearchSynonym from '../../modules/business_category/business_search_synonym.model.js';
import BusinessSearchLog from '../../modules/business_category/business_search_log.model.js';
import { getDynamicSynonymConfig } from '../../modules/business_category/business_search_intelligence.service.js';

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

export const runEnterpriseSearchMigration = async () => {
  console.log('Running Enterprise Search Infrastructure migration...');
  await BusinessSearchSynonym.sync();
  await BusinessSearchLog.sync();
  console.log('  + [OK]   Synced business_search_synonyms & business_search_logs tables');

  const synCfg = await getDynamicSynonymConfig();
  console.log(`  + [OK]   Seeded/verified ${synCfg.totalCount} active search synonyms`);

  await ensureIndex(
    'business_products',
    'idx_bp_public_active',
    'CREATE INDEX idx_bp_public_active ON business_products (status, approval_status, is_deleted, category_id, business_id)'
  );
  await ensureIndex(
    'business_products',
    'ft_bp_search',
    'ALTER TABLE business_products ADD FULLTEXT INDEX ft_bp_search (name, brand, category_name, subcategory_name, short_description)'
  );

  await ensureIndex(
    'business_profiles',
    'idx_bprof_public_geo',
    'CREATE INDEX idx_bprof_public_geo ON business_profiles (is_deleted, is_active, is_verified, latitude, longitude)'
  );
  await ensureIndex(
    'business_profiles',
    'ft_bprof_search',
    'ALTER TABLE business_profiles ADD FULLTEXT INDEX ft_bprof_search (business_name, serviceCategory, description, locality_name, city_name)'
  );

  console.log('Enterprise Search Infrastructure migration completed.');
};

const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].replace(/\\/g, '/').endsWith('add_enterprise_search_infrastructure.js');

if (isDirectRun) {
  runEnterpriseSearchMigration()
    .then(async () => {
      await sequelize.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await sequelize.close().catch(() => {});
      process.exit(1);
    });
}
