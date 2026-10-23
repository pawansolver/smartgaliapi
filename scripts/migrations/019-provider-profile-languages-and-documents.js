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

  console.log('[019-provider-profile-languages-and-documents] UP...');

  // 1. Add languages JSON column to service_provider_profiles
  if (has('service_provider_profiles')) {
    await ensureColumn(queryInterface, 'service_provider_profiles', 'languages', {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null,
    });
  }

  // 2. Create provider_documents table if it does not exist
  if (!has('provider_documents')) {
    await queryInterface.createTable('provider_documents', {
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
      document_type: {
        type: DataTypes.STRING(50),
        defaultValue: 'other',
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      file_url: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      file_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      file_size: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(50),
        defaultValue: 'under_review',
        allowNull: false,
      },
      verified_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
          model: 'users',
          key: 'userId',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      verified_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
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
    console.log('  Created table provider_documents');
  }

  // Indexes on provider_documents
  await ensureIndex(queryInterface, 'provider_documents', ['provider_id'], 'idx_pd_provider_id');
  await ensureIndex(queryInterface, 'provider_documents', ['user_id'], 'idx_pd_user_id');
  await ensureIndex(queryInterface, 'provider_documents', ['status'], 'idx_pd_status');
  await ensureIndex(queryInterface, 'provider_documents', ['is_active', 'is_deleted'], 'idx_pd_active_deleted');

  console.log('[019-provider-profile-languages-and-documents] UP completed.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[019-provider-profile-languages-and-documents] DOWN...');
  try {
    await queryInterface.dropTable('provider_documents');
    console.log('  Dropped table provider_documents');
  } catch (err) {
    console.warn('  [WARN] dropTable provider_documents:', err.message);
  }
  try {
    await queryInterface.removeColumn('service_provider_profiles', 'languages');
    console.log('  Removed column languages from service_provider_profiles');
  } catch (err) {
    console.warn('  [WARN] removeColumn languages:', err.message);
  }
  console.log('[019-provider-profile-languages-and-documents] DOWN completed.');
};
