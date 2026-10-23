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
    }
  } catch (err) {
    console.warn(`  [WARN] ensureIndex ${name} on ${table}:`, err.message);
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  const tables = await tableNames(queryInterface);
  const has = (t) => tables.includes(t);

  console.log('[020-dynamic-kyc-requirements-and-service-requests] UP...');

  // 1. kyc_document_types master table
  if (!has('kyc_document_types')) {
    await queryInterface.createTable('kyc_document_types', {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      allowed_mime_types: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      max_file_size_bytes: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 10485760, // 10 MB
      },
      requires_expiry: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      deletedRemarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    });
    console.log('  Created table kyc_document_types');
  }

  await ensureIndex(queryInterface, 'kyc_document_types', ['code'], 'idx_kyc_doc_types_code', { unique: true });

  // 2. Seed baseline document types
  const [existingTypes] = await sequelize.query('SELECT COUNT(*) as cnt FROM kyc_document_types');
  if (existingTypes[0].cnt === 0 || existingTypes[0].cnt === '0') {
    const defaultMimes = JSON.stringify(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
    await sequelize.query(`
      INSERT INTO kyc_document_types (code, name, description, allowed_mime_types, max_file_size_bytes, requires_expiry, is_active, is_deleted, created_at, updatedAt)
      VALUES
        ('identity_proof', 'Government Identity Proof', 'Valid Government Issued ID (Aadhaar, Passport, Voter ID, Driving Licence)', '${defaultMimes}', 10485760, false, true, false, NOW(), NOW()),
        ('trade_license', 'Trade / Contractor License', 'Valid trade license or municipal contractor permit', '${defaultMimes}', 10485760, true, true, false, NOW(), NOW()),
        ('skill_certificate', 'Skill / Technical Qualification Certificate', 'Diploma, ITI, or accredited technical certification', '${defaultMimes}', 10485760, false, true, false, NOW(), NOW()),
        ('address_proof', 'Registered Address Proof', 'Utility bill, rent agreement, or business premises address proof', '${defaultMimes}', 10485760, false, true, false, NOW(), NOW()),
        ('experience_letter', 'Work Experience Proof / Reference', 'Experience letter, company reference, or prior employment record', '${defaultMimes}', 10485760, false, true, false, NOW(), NOW()),
        ('other', 'Other Compliance Document', 'Any supplementary document requested during verification', '${defaultMimes}', 10485760, false, true, false, NOW(), NOW())
    `);
    console.log('  Seeded 6 baseline document types into kyc_document_types');
  }

  // 3. Add columns to provider_documents
  if (has('provider_documents')) {
    await ensureColumn(queryInterface, 'provider_documents', 'document_type_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'provider_documents', 'document_number', {
      type: DataTypes.STRING(100),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'provider_documents', 'expiry_date', {
      type: DataTypes.DATEONLY,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'provider_documents', 'issue_date', {
      type: DataTypes.DATEONLY,
      allowNull: true,
    });

    await sequelize.query(`
      UPDATE provider_documents pd
      JOIN kyc_document_types kdt ON pd.document_type = kdt.code
      SET pd.document_type_id = kdt.id
      WHERE pd.document_type_id IS NULL
    `);
    console.log('  Backfilled provider_documents.document_type_id from kyc_document_types');
  }

  // 4. Add kyc_configured to service_categories
  if (has('service_categories')) {
    await ensureColumn(queryInterface, 'service_categories', 'kyc_configured', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  }

  // 5. category_document_requirements table
  if (!has('category_document_requirements')) {
    await queryInterface.createTable('category_document_requirements', {
      id: {
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
      kyc_document_type_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: 'kyc_document_types',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      is_mandatory: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      applicable_provider_type: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      deletedRemarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    });
    console.log('  Created table category_document_requirements');
  }

  await ensureIndex(queryInterface, 'category_document_requirements', ['service_category_id', 'kyc_document_type_id'], 'idx_cat_doc_req');

  // 6. service_subcategory_requests table
  if (!has('service_subcategory_requests')) {
    await queryInterface.createTable('service_subcategory_requests', {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      provider_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: 'service_provider_profiles',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: 'users',
          key: 'userId',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
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
      suggested_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'pending',
      },
      reviewed_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
          model: 'users',
          key: 'userId',
        },
      },
      reviewed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      review_note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      resolved_subcategory_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
          model: 'service_subcategories',
          key: 'service_subcategory_id',
        },
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.BIGINT,
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
      deletedRemarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    });
    console.log('  Created table service_subcategory_requests');
  }

  await ensureIndex(queryInterface, 'service_subcategory_requests', ['provider_id'], 'idx_subcat_req_provider');
  await ensureIndex(queryInterface, 'service_subcategory_requests', ['service_category_id'], 'idx_subcat_req_category');
  await ensureIndex(queryInterface, 'service_subcategory_requests', ['status'], 'idx_subcat_req_status');

  console.log('[020-dynamic-kyc-requirements-and-service-requests] UP DONE.');
};

export const down = async () => {
  console.log('[020-dynamic-kyc-requirements-and-service-requests] DOWN...');
};
