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

  console.log('[018-service-subcategories-and-kyc-trade-lock] UP...');

  // 1. Create service_subcategories table if it does not exist
  if (!has('service_subcategories')) {
    await queryInterface.createTable('service_subcategories', {
      service_subcategory_id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      service_category_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: 'service_categories',
          key: 'serviceCategoryId',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      service_subcategory_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      service_subcategory_slug: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      service_subcategory_image: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      deletedRemarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      remark: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });
    console.log('  Created table service_subcategories');
  }

  // Indexes on service_subcategories
  await ensureIndex(queryInterface, 'service_subcategories', ['service_category_id'], 'idx_ssc_category_id');
  await ensureIndex(queryInterface, 'service_subcategories', ['is_active', 'is_deleted'], 'idx_ssc_active_deleted');
  await ensureIndex(queryInterface, 'service_subcategories', ['service_subcategory_slug'], 'idx_ssc_slug');

  // 2. Add service_subcategory_id to service_listings (safe, nullable)
  if (has('service_listings')) {
    await ensureColumn(queryInterface, 'service_listings', 'service_subcategory_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: 'service_subcategories',
        key: 'service_subcategory_id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await ensureIndex(queryInterface, 'service_listings', ['service_subcategory_id'], 'idx_sl_subcategory_id');
  }

  // 3. Seed canonical subcategories for existing active categories
  try {
    const [categories] = await sequelize.query(
      'SELECT serviceCategoryId, serviceCategoryName FROM service_categories WHERE is_deleted = false'
    );

    const subcategorySeeds = {
      'Electrician': [
        'AC Service & Jet Wash',
        'Fan Installation & Repair',
        'Switch, Socket & Wiring',
        'Inverter & Battery Servicing',
        'MCB & Short Circuit Repair',
      ],
      'Plumber': [
        'Tap, Mixer & Faucet Repair',
        'Pipe Leakage & Drainage Blockage',
        'Toilet & Bathroom Sanitary Fitting',
        'Water Tank Deep Cleaning',
        'Motor & Pump Installation',
      ],
      'Appliance Repair': [
        'Refrigerator Service & Gas Fill',
        'Washing Machine Motor & PCB Repair',
        'Microwave Oven Repair',
        'Geyser / Water Heater Repair',
        'Kitchen Chimney Deep Servicing',
      ],
      'Home Cleaning': [
        'Full Home Deep Cleaning',
        'Bathroom & Tile Deep Scrubbing',
        'Kitchen Chimney & Counter Degreasing',
        'Sofa & Carpet Shampooing',
        'Balcony & Floor Sanitization',
      ],
      'Carpenter': [
        'Door Lock, Latch & Handle Repair',
        'Custom Furniture Assembly',
        'Cupboard & Drawer Hinge Repair',
        'Bed & Wardrobe Wood Polishing',
      ],
      'Painter': [
        'Full House Interior Painting',
        'Waterproofing & Damp Treatment',
        'Wall Stencil & Texture Design',
        'Doors, Grills & Enamel Painting',
      ],
      'AC Repair': [
        'Split AC Jet Wash',
        'Window AC Servicing',
        'Inverter AC Diagnosis & PCB',
        'Central / Cassette AC Servicing',
      ]
    };

    for (const cat of categories) {
      const catName = cat.serviceCategoryName;
      const subs = subcategorySeeds[catName] || [];
      for (const subName of subs) {
        const slug = subName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const [existing] = await sequelize.query(
          'SELECT service_subcategory_id FROM service_subcategories WHERE service_category_id = ? AND service_subcategory_name = ? LIMIT 1',
          { replacements: [cat.serviceCategoryId, subName] }
        );
        if (!existing || existing.length === 0) {
          await sequelize.query(
            'INSERT INTO service_subcategories (service_category_id, service_subcategory_name, service_subcategory_slug, is_active, is_deleted, created_at, updatedAt) VALUES (?, ?, ?, true, false, NOW(), NOW())',
            { replacements: [cat.serviceCategoryId, subName, slug] }
          );
        }
      }
    }
    console.log('  Seeded subcategories for active service categories.');
  } catch (seedErr) {
    console.warn('  [WARN] Subcategory seeding skipped/failed:', seedErr.message);
  }

  console.log('[018-service-subcategories-and-kyc-trade-lock] UP completed.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[018-service-subcategories-and-kyc-trade-lock] DOWN...');
  try {
    await queryInterface.removeColumn('service_listings', 'service_subcategory_id');
  } catch (_) {}
  try {
    await queryInterface.dropTable('service_subcategories');
  } catch (_) {}
  console.log('[018-service-subcategories-and-kyc-trade-lock] DOWN completed.');
};
