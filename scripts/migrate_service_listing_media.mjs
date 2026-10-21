import sequelize from '../src/config/db.js';

async function migrate() {
  console.log('[MIGRATION] Starting Service Listing Media Migration...');

  // Create service_listing_media table
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS \`service_listing_media\` (
      \`id\` BIGINT(20) NOT NULL AUTO_INCREMENT,
      \`service_listing_id\` BIGINT(20) NOT NULL,
      \`provider_id\` BIGINT(20) NOT NULL,
      \`media_url\` VARCHAR(1000) NOT NULL,
      \`media_type\` VARCHAR(50) NOT NULL DEFAULT 'image',
      \`file_name\` VARCHAR(255) DEFAULT NULL,
      \`file_size\` INT(11) DEFAULT NULL,
      \`mime_type\` VARCHAR(100) DEFAULT NULL,
      \`display_order\` INT(11) NOT NULL DEFAULT 1,
      \`is_primary\` TINYINT(1) NOT NULL DEFAULT 0,
      \`status\` VARCHAR(50) NOT NULL DEFAULT 'active',
      \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
      \`is_deleted\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_by\` BIGINT(20) DEFAULT NULL,
      \`updated_by\` BIGINT(20) DEFAULT NULL,
      \`remark\` TEXT DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      \`deletedRemarks\` TEXT DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      KEY \`idx_slm_listing_status\` (\`service_listing_id\`, \`status\`, \`is_deleted\`),
      KEY \`idx_slm_provider_listing\` (\`provider_id\`, \`service_listing_id\`),
      KEY \`idx_slm_display_order\` (\`service_listing_id\`, \`display_order\`),
      CONSTRAINT \`fk_slm_service_listing\` FOREIGN KEY (\`service_listing_id\`) REFERENCES \`service_listings\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_slm_provider_profile\` FOREIGN KEY (\`provider_id\`) REFERENCES \`service_provider_profiles\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('[MIGRATION] Table service_listing_media successfully created / verified.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('[MIGRATION ERROR]', err);
  process.exit(1);
});
