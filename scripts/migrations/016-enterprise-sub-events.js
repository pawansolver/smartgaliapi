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

export const up = async ({ queryInterface = sequelize.getQueryInterface(), database = sequelize } = {}) => {
  const tables = await tableNames(queryInterface);
  const has = (t) => tables.includes(t);

  console.log('[016-enterprise-sub-events] UP...');

  if (has('events')) {
    await ensureColumn(queryInterface, 'events', 'sub_events', {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Enterprise sub-events, agenda, or schedule items inside the event',
    });
  }

  console.log('[016-enterprise-sub-events] UP complete.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[016-enterprise-sub-events] DOWN...');
  try {
    await queryInterface.removeColumn('events', 'sub_events');
    console.log('  Removed column sub_events from events');
  } catch (err) {
    console.warn('  [WARN] removeColumn sub_events note:', err.message);
  }
  console.log('[016-enterprise-sub-events] DOWN complete.');
};

export const version = '016-enterprise-sub-events';
