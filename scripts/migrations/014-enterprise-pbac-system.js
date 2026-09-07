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
      console.log('  Added column ' + column + ' to ' + table);
    }
  } catch (err) {
    console.warn('  [WARN] ensureColumn ' + column + ' on ' + table + ':', err.message);
  }
};

const ensureIndex = async (queryInterface, table, fields, name, options = {}) => {
  try {
    const indexes = await queryInterface.showIndex(table);
    const exists = indexes.some((idx) => idx.name === name);
    if (!exists) {
      await queryInterface.addIndex(table, fields, { name, ...options });
      console.log('  Added index ' + name + ' on ' + table);
    }
  } catch (err) {
    console.warn('  [WARN] ensureIndex ' + name + ' on ' + table + ':', err.message);
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface(), database = sequelize } = {}) => {
  const tables = await tableNames(queryInterface);
  const has = (t) => tables.includes(t);

  console.log('[014-enterprise-pbac-system] UP: Migrating PBAC schema...');

  // 1. Align roles table
  if (has('roles')) {
    await ensureColumn(queryInterface, 'roles', 'role_code', {
      type: DataTypes.STRING(50),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'roles', 'scope', {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'platform',
    });
    await ensureColumn(queryInterface, 'roles', 'is_system_role', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await ensureIndex(queryInterface, 'roles', ['role_code'], 'uq_roles_role_code', { unique: true });
    await ensureIndex(queryInterface, 'roles', ['scope', 'is_active', 'is_deleted'], 'ix_roles_scope_active');
  } else {
    await queryInterface.createTable('roles', {
      roleId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      role_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      roleName: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      roleDescription: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      scope: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'platform',
      },
      is_system_role: {
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
        type: DataTypes.TEXT,
        allowNull: true,
      },
      deletedRemarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });
    console.log('  Created table: roles');
  }

  // 2. Create permissions table
  if (!has('permissions')) {
    await queryInterface.createTable('permissions', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      permission_code: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      permission_name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      module: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_system_permission: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });
    await ensureIndex(queryInterface, 'permissions', ['permission_code'], 'uq_permissions_code', { unique: true });
    await ensureIndex(queryInterface, 'permissions', ['module', 'is_active', 'is_deleted'], 'ix_permissions_module');
    console.log('  Created table: permissions');
  }

  // 3. Create role_permissions table
  if (!has('role_permissions')) {
    await queryInterface.createTable('role_permissions', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      permission_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });
    await ensureIndex(queryInterface, 'role_permissions', ['role_id', 'permission_id'], 'uq_role_permissions_role_perm', { unique: true });
    await ensureIndex(queryInterface, 'role_permissions', ['permission_id'], 'ix_role_permissions_perm');
    console.log('  Created table: role_permissions');
  }

  // 4. Create user_roles table
  if (!has('user_roles')) {
    await queryInterface.createTable('user_roles', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      role_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      assigned_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });
    await ensureIndex(queryInterface, 'user_roles', ['user_id', 'role_id'], 'uq_user_roles_user_role', { unique: true });
    await ensureIndex(queryInterface, 'user_roles', ['role_id'], 'ix_user_roles_role');
    console.log('  Created table: user_roles');
  }

  // 5. Create user_permissions table
  if (!has('user_permissions')) {
    await queryInterface.createTable('user_permissions', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      permission_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      effect: {
        type: DataTypes.ENUM('ALLOW', 'DENY'),
        allowNull: false,
        defaultValue: 'ALLOW',
      },
      assigned_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });
    await ensureIndex(queryInterface, 'user_permissions', ['user_id', 'permission_id'], 'uq_user_permissions_user_perm', { unique: true });
    await ensureIndex(queryInterface, 'user_permissions', ['permission_id'], 'ix_user_permissions_perm');
    console.log('  Created table: user_permissions');
  }

  console.log('[014-enterprise-pbac-system] UP complete.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[014-enterprise-pbac-system] DOWN: Reverting PBAC schema...');
  const tables = await tableNames(queryInterface);

  if (tables.includes('user_permissions')) {
    await queryInterface.dropTable('user_permissions');
    console.log('  Dropped table: user_permissions');
  }
  if (tables.includes('user_roles')) {
    await queryInterface.dropTable('user_roles');
    console.log('  Dropped table: user_roles');
  }
  if (tables.includes('role_permissions')) {
    await queryInterface.dropTable('role_permissions');
    console.log('  Dropped table: role_permissions');
  }
  if (tables.includes('permissions')) {
    await queryInterface.dropTable('permissions');
    console.log('  Dropped table: permissions');
  }
  console.log('[014-enterprise-pbac-system] DOWN complete.');
};

export default { up, down };
