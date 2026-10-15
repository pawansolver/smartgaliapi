import { DataTypes } from 'sequelize';
import sequelize from '../../src/config/db.js';

const tableNames = async (queryInterface) => {
  if (typeof queryInterface.showAllTables === 'function') {
    const raw = await queryInterface.showAllTables();
    return raw.map((item) => (typeof item === 'string' ? item : item.tableName || item.name));
  }
  return [];
};

const ensureColumn = async (queryInterface, table, column, definition) => {
  try {
    const description = await queryInterface.describeTable(table);
    if (!description[column]) {
      await queryInterface.addColumn(table, column, definition);
      console.log(`  Added column ${column} to ${table}`);
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
    }
  } catch (err) {
    console.warn(`  [WARN] ensureIndex ${name} on ${table}:`, err.message);
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  const tables = await tableNames(queryInterface);
  const has = (t) => tables.includes(t);

  console.log('[017-enterprise-services-hardening] UP...');

  // 1. service_provider_profiles columns
  if (has('service_provider_profiles')) {
    await ensureColumn(queryInterface, 'service_provider_profiles', 'business_name', {
      type: DataTypes.STRING(255),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_provider_profiles', 'provider_type', {
      type: DataTypes.STRING(100),
      defaultValue: 'Independent Professional',
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_provider_profiles', 'rating', {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.00,
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'service_provider_profiles', 'review_count', {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'service_provider_profiles', 'completed_jobs_count', {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'service_provider_profiles', 'is_online', {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'service_provider_profiles', 'verification_status', {
      type: DataTypes.STRING(50),
      defaultValue: 'underReview',
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'service_provider_profiles', 'service_area', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_provider_profiles', 'availability', {
      type: DataTypes.TEXT,
      allowNull: true,
    });

    await ensureIndex(queryInterface, 'service_provider_profiles', ['user_id'], 'idx_spp_user_id');
    await ensureIndex(queryInterface, 'service_provider_profiles', ['is_verified', 'verification_status'], 'idx_spp_verification');
  }

  // 2. service_listings columns
  if (has('service_listings')) {
    await ensureColumn(queryInterface, 'service_listings', 'category_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_listings', 'moderation_status', {
      type: DataTypes.STRING(50),
      defaultValue: 'approved',
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'service_listings', 'moderation_remarks', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_listings', 'highlights', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_listings', 'safe_terms', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_listings', 'images', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_listings', 'bookings_count', {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'service_listings', 'rating', {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.00,
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'service_listings', 'reviews_count', {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });

    await ensureIndex(queryInterface, 'service_listings', ['provider_id'], 'idx_sl_provider_id');
    await ensureIndex(queryInterface, 'service_listings', ['category_id'], 'idx_sl_category_id');
    await ensureIndex(queryInterface, 'service_listings', ['moderation_status', 'is_available', 'is_active', 'is_deleted'], 'idx_sl_moderation_available');
  }

  // 3. service_bookings columns
  if (has('service_bookings')) {
    await ensureColumn(queryInterface, 'service_bookings', 'provider_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_bookings', 'doorstep_pin', {
      type: DataTypes.STRING(10),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_bookings', 'doorstep_pin_verified', {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'service_bookings', 'rejection_reason', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_bookings', 'proposed_reschedule_date', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_bookings', 'proposed_reschedule_slot', {
      type: DataTypes.STRING(100),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_bookings', 'proposed_reschedule_reason', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_bookings', 'price_snapshot', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_bookings', 'started_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_bookings', 'completed_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    await ensureIndex(queryInterface, 'service_bookings', ['user_id'], 'idx_sb_user_id');
    await ensureIndex(queryInterface, 'service_bookings', ['provider_id'], 'idx_sb_provider_id');
    await ensureIndex(queryInterface, 'service_bookings', ['listing_id'], 'idx_sb_listing_id');
    await ensureIndex(queryInterface, 'service_bookings', ['status'], 'idx_sb_status');
    await ensureIndex(queryInterface, 'service_bookings', ['scheduled_at'], 'idx_sb_scheduled_at');
  }

  // 4. service_reviews columns and unique constraint
  if (has('service_reviews')) {
    await ensureColumn(queryInterface, 'service_reviews', 'listing_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'service_reviews', 'provider_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
    });

    await ensureIndex(queryInterface, 'service_reviews', ['booking_id', 'user_id'], 'idx_sr_booking_user_unique', { unique: true });
    await ensureIndex(queryInterface, 'service_reviews', ['listing_id'], 'idx_sr_listing_id');
    await ensureIndex(queryInterface, 'service_reviews', ['provider_id'], 'idx_sr_provider_id');
  }

  // 5. service_booking_timelines table
  if (!has('service_booking_timelines')) {
    await queryInterface.createTable('service_booking_timelines', {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      booking_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      actor_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      actor_role: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
    });
    console.log('  Created table service_booking_timelines');
    await ensureIndex(queryInterface, 'service_booking_timelines', ['booking_id'], 'idx_sbt_booking_id');
  }

  // 6. Safe backfill of missing provider_id / category_id links
  try {
    await sequelize.query(`
      UPDATE service_listings sl
      JOIN service_provider_profiles spp ON sl.provider_id = spp.id
      SET sl.category_id = spp.service_category_id
      WHERE sl.category_id IS NULL AND spp.service_category_id IS NOT NULL;
    `);

    await sequelize.query(`
      UPDATE service_bookings sb
      JOIN service_listings sl ON sb.listing_id = sl.id
      SET sb.provider_id = sl.provider_id
      WHERE sb.provider_id IS NULL AND sl.provider_id IS NOT NULL;
    `);

    await sequelize.query(`
      UPDATE service_listings
      SET moderation_status = 'approved'
      WHERE moderation_status IS NULL OR moderation_status = '';
    `);
    console.log('  Backfill complete');
  } catch (backfillErr) {
    console.warn('  [WARN] Backfill step:', backfillErr.message);
  }

  console.log('[017-enterprise-services-hardening] UP Complete.');
};

export const down = async () => {
  console.log('[017-enterprise-services-hardening] DOWN - Non-destructive, skipping column drop.');
};
