import UserDevice from '../../src/modules/user_devices/user_device.model.js';
import sequelize from '../../src/config/db.js';

export const version = '007-user-devices';

/**
 * Indexes:
 * - uq_user_devices_user_device (user_id, device_id) UNIQUE
 *   Why: one registration row per physical/logical device per user;
 *   supports multi-device without duplicate device_id rows.
 * - ix_user_devices_user_active (user_id, is_active)
 *   Why: notification worker loads active devices for a recipient user.
 * - ix_user_devices_push_token (push_token)
 *   Why: invalid-token cleanup deactivates by FCM token; token-move lookup.
 */

const ensureIndex = async (queryInterface, table, fields, name, options = {}) => {
  const indexes = await queryInterface.showIndex(table);
  const alreadyExists = indexes.some((idx) => idx.name === name);
  if (!alreadyExists) {
    await queryInterface.addIndex(table, fields, { ...options, name });
    console.log('  Added: ' + name);
  } else {
    console.log('  Skipped (exists): ' + name);
  }
};

const removeIndexIfPresent = async (queryInterface, table, name) => {
  const indexes = await queryInterface.showIndex(table);
  const target = indexes.find((idx) => idx.name === name);
  if (!target) return;
  if (target.primary) {
    console.log('  Skipping primary key: ' + name);
    return;
  }
  try {
    await queryInterface.removeIndex(table, name);
    console.log('  Removed: ' + name);
  } catch (err) {
    if (err.original && err.original.code === 'ER_DROP_INDEX_FK') {
      console.log('  Skipped (FK constraint backing index, safe to leave): ' + name);
    } else {
      throw err;
    }
  }
};

export const up = async ({
  model = UserDevice,
  queryInterface = sequelize.getQueryInterface(),
} = {}) => {
  console.log('[007-user-devices] UP...');
  await model.sync();

  const tableName = typeof model.getTableName === 'function'
    ? model.getTableName()
    : 'user_devices';

  await ensureIndex(
    queryInterface,
    tableName,
    ['user_id', 'device_id'],
    'uq_user_devices_user_device',
    { unique: true },
  );
  await ensureIndex(
    queryInterface,
    tableName,
    ['user_id', 'is_active'],
    'ix_user_devices_user_active',
  );
  await ensureIndex(
    queryInterface,
    tableName,
    ['push_token'],
    'ix_user_devices_push_token',
  );
  console.log('[007-user-devices] UP complete.');
};

export const down = async ({
  queryInterface = sequelize.getQueryInterface(),
  model = UserDevice,
} = {}) => {
  console.log('[007-user-devices] DOWN...');
  const tableName = typeof model.getTableName === 'function'
    ? model.getTableName()
    : 'user_devices';

  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table : (table.tableName || table.table_name),
  );

  if (tables.includes(tableName)) {
    await removeIndexIfPresent(queryInterface, tableName, 'ix_user_devices_push_token');
    await removeIndexIfPresent(queryInterface, tableName, 'ix_user_devices_user_active');
    await removeIndexIfPresent(queryInterface, tableName, 'uq_user_devices_user_device');
    await queryInterface.dropTable(tableName);
    console.log('  Dropped table: ' + tableName);
  } else {
    console.log('  Table not present: ' + tableName);
  }
  console.log('[007-user-devices] DOWN complete.');
};
