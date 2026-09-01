/**
 * Migration 008 — user_follows table
 * Phase 8: Follow / Followers / Following
 *
 * Creates (if absent):
 *   user_follows table with follower_id + following_id
 *
 * Indexes:
 *   uq_user_follows_pair         UNIQUE(follower_id, following_id)
 *   ix_user_follows_follower_id  (follower_id)    — "who does user X follow?"
 *   ix_user_follows_following_id (following_id)   — "who follows user X?"
 */

import sequelize from '../../src/config/db.js';
import Follow from '../../src/modules/follow/follow.model.js';

export const version = '008-user-follows';

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
      console.log('  Skipped (FK constraint backing index): ' + name);
    } else {
      throw err;
    }
  }
};

export const up = async ({
  model = Follow,
  queryInterface = sequelize.getQueryInterface(),
} = {}) => {
  console.log('[008-user-follows] UP...');
  await model.sync();

  const tableName = typeof model.getTableName === 'function'
    ? model.getTableName()
    : 'follows';

  // Unique pair constraint: prevents duplicate follows
  await ensureIndex(
    queryInterface,
    tableName,
    ['follower_id', 'following_id'],
    'uq_user_follows_pair',
    { unique: true },
  );

  // Index for: "give me everyone X follows" (following list)
  await ensureIndex(
    queryInterface,
    tableName,
    ['follower_id'],
    'ix_user_follows_follower_id',
  );

  // Index for: "give me everyone who follows X" (followers list)
  await ensureIndex(
    queryInterface,
    tableName,
    ['following_id'],
    'ix_user_follows_following_id',
  );

  console.log('[008-user-follows] UP complete.');
};

export const down = async ({
  queryInterface = sequelize.getQueryInterface(),
  model = Follow,
} = {}) => {
  console.log('[008-user-follows] DOWN...');
  const tableName = typeof model.getTableName === 'function'
    ? model.getTableName()
    : 'follows';

  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table : (table.tableName || table.table_name),
  );

  if (tables.includes(tableName)) {
    await removeIndexIfPresent(queryInterface, tableName, 'uq_user_follows_pair');
    await removeIndexIfPresent(queryInterface, tableName, 'ix_user_follows_follower_id');
    await removeIndexIfPresent(queryInterface, tableName, 'ix_user_follows_following_id');
    console.log('  Indexes removed from: ' + tableName);
  } else {
    console.log('  Table not present: ' + tableName);
  }
  console.log('[008-user-follows] DOWN complete.');
};
