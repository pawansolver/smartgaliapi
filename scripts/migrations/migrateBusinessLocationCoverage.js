import { DataTypes } from 'sequelize';
import sequelize from '../../src/config/db.js';
import BusinessProfile from '../../src/modules/business_profile/business_profile.model.js';
import BusinessCoverageArea from '../../src/modules/business_profile/business_coverage_area.model.js';
import SocietyBusinessAccess from '../../src/modules/business_profile/society_business_access.model.js';

const BUSINESS_PROFILE_COLUMNS = {
  category_id: { type: DataTypes.BIGINT, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  address: { type: DataTypes.STRING(500), allowNull: true },
  phone: { type: DataTypes.STRING(50), allowNull: true },
  email: { type: DataTypes.STRING(150), allowNull: true },
  website: { type: DataTypes.STRING(255), allowNull: true },
  logo_url: { type: DataTypes.STRING(500), allowNull: true },
  state_id: { type: DataTypes.BIGINT, allowNull: true },
  district_id: { type: DataTypes.BIGINT, allowNull: true },
  city_id: { type: DataTypes.BIGINT, allowNull: true },
  city_name: { type: DataTypes.STRING(120), allowNull: true },
  locality_id: { type: DataTypes.BIGINT, allowNull: true },
  locality_name: { type: DataTypes.STRING(150), allowNull: true },
  pincode_id: { type: DataTypes.BIGINT, allowNull: true },
  pincode: { type: DataTypes.STRING(20), allowNull: true },
  society_id: { type: DataTypes.BIGINT, allowNull: true },
  latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
  longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
  coverage_scope: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'PUBLIC',
  },
  default_radius_km: {
    type: DataTypes.DECIMAL(6, 2),
    allowNull: false,
    defaultValue: 10.0,
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  is_featured: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  is_open: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
};

const safeAddIndex = async (queryInterface, tableName, fields, name) => {
  try {
    const indexes = await queryInterface.showIndex(tableName);
    if (!indexes.some((idx) => idx.name === name)) {
      await queryInterface.addIndex(tableName, fields, { name });
    }
  } catch (err) {
    console.warn(`[MIGRATION] Skipping index ${name} on ${tableName}:`, err.message);
  }
};

async function run() {
  console.log('[MIGRATION] Starting Business Location & Coverage migration...');
  await sequelize.authenticate();
  const queryInterface = sequelize.getQueryInterface();

  // 1. Add missing columns to business_profiles idempotently
  const existingCols = await queryInterface.describeTable('business_profiles');
  for (const [colName, colDef] of Object.entries(BUSINESS_PROFILE_COLUMNS)) {
    if (!existingCols[colName]) {
      await queryInterface.addColumn('business_profiles', colName, colDef);
      console.log(`  + Added column business_profiles.${colName}`);
    }
  }

  await safeAddIndex(queryInterface, 'business_profiles', ['city_id'], 'idx_bp_city_id');
  await safeAddIndex(queryInterface, 'business_profiles', ['locality_id'], 'idx_bp_locality_id');
  await safeAddIndex(queryInterface, 'business_profiles', ['pincode_id'], 'idx_bp_pincode_id');
  await safeAddIndex(queryInterface, 'business_profiles', ['society_id'], 'idx_bp_society_id');
  await safeAddIndex(queryInterface, 'business_profiles', ['latitude', 'longitude'], 'idx_bp_lat_lng');

  // 2. Ensure business_coverage_areas & society_business_accesses exist idempotently
  const allTables = (await queryInterface.showAllTables()).map((t) =>
    typeof t === 'string' ? t : t.tableName || t.table_name
  );
  if (!allTables.includes('business_coverage_areas')) {
    await BusinessCoverageArea.sync();
  }
  console.log('  + Verified table business_coverage_areas');

  if (!allTables.includes('society_business_accesses')) {
    await SocietyBusinessAccess.sync();
  }
  console.log('  + Verified table society_business_accesses');

  // 3. Soft-delete legacy automated test/spam business profiles (keep real store id: 101)
  const [, cleanMeta] = await sequelize.query(
    `UPDATE business_profiles
     SET is_deleted = 1,
         deletedRemarks = 'Cleaned test/legacy records during business location setup'
     WHERE is_deleted = 0 AND id != 101`
  );
  console.log('  + Soft-deleted legacy/test business profiles (rows affected):', cleanMeta?.affectedRows ?? 0);

  // 4. Configure Nike Store (id: 101) with verified Patna / Khagaul Location Master + GPS data
  const nike = await BusinessProfile.findByPk(101);
  if (nike) {
    await nike.update({
      businessName: nike.businessName || 'Nike Store',
      category_id: nike.category_id || 10,
      serviceCategory: nike.serviceCategory || 'Footwear & Sportswear',
      description:
        nike.description ||
        'Official Nike Store — premium running shoes, activewear, sneakers and sports gear.',
      address: 'Station Road, Khagaul, Patna',
      phone: '+91 98765 43210',
      email: 'nikestore@smartgali.in',
      operatingHours: nike.operatingHours || '10:00 AM - 09:30 PM',
      state_id: 1,
      district_id: 41,
      city_id: 1,
      city_name: 'Patna',
      locality_id: 9,
      locality_name: 'Khagaul',
      pincode_id: 8,
      pincode: '801105',
      latitude: 25.5786,
      longitude: 85.0464,
      coverage_scope: 'PUBLIC',
      default_radius_km: 15.0,
      is_verified: true,
      is_featured: true,
      is_open: true,
      is_active: true,
      is_deleted: false,
      updatedAt: new Date(),
    });
    console.log('  + Updated Nike Store (id: 101) with Khagaul, Patna (801105) location & GPS.');

    const existingAreas = await BusinessCoverageArea.count({
      where: { business_id: 101, is_deleted: false },
    });
    if (existingAreas === 0) {
      await BusinessCoverageArea.bulkCreate([
        {
          business_id: 101,
          coverage_scope: 'PUBLIC',
          coverage_method: 'RADIUS',
          state_id: 1,
          district_id: 41,
          city_id: 1,
          city_name: 'Patna',
          locality_id: 9,
          locality_name: 'Khagaul',
          pincode_id: 8,
          pincode: '801105',
          origin_latitude: 25.5786,
          origin_longitude: 85.0464,
          origin_address: 'Station Road, Khagaul, Patna',
          resolved_radius_km: 15.0,
          is_active: true,
          is_deleted: false,
          display_order: 0,
        },
        {
          business_id: 101,
          coverage_scope: 'PUBLIC',
          coverage_method: 'CITY',
          state_id: 1,
          district_id: 41,
          city_id: 1,
          city_name: 'Patna',
          is_active: true,
          is_deleted: false,
          display_order: 1,
        },
      ]);
      console.log('  + Seeded default RADIUS (15 km) & CITY (Patna) coverage areas for Nike Store #101.');
    }
  }

  console.log('[MIGRATION] Business Location & Coverage migration completed cleanly.');
}

run()
  .catch((err) => {
    console.error('[MIGRATION] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
