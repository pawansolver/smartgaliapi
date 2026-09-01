import { DataTypes, QueryTypes } from 'sequelize';
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

export const up = async ({ queryInterface = sequelize.getQueryInterface(), database = sequelize } = {}) => {
  const tables = await tableNames(queryInterface);
  const has = (t) => tables.includes(t);

  console.log('[012-events-hardening] UP...');

  // 1. Events Table Enterprise Fields
  if (has('events')) {
    await ensureColumn(queryInterface, 'events', 'location_name', { type: DataTypes.STRING(255), allowNull: true });
    await ensureColumn(queryInterface, 'events', 'address', { type: DataTypes.TEXT, allowNull: true });
    await ensureColumn(queryInterface, 'events', 'max_participants', { type: DataTypes.INTEGER, allowNull: true });
    await ensureColumn(queryInterface, 'events', 'visibility', {
      type: DataTypes.ENUM('public', 'community', 'private'),
      defaultValue: 'public',
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'events', 'status', {
      type: DataTypes.ENUM('draft', 'published', 'cancelled', 'completed'),
      defaultValue: 'published',
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'events', 'going_count', {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'events', 'interested_count', {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'events', 'declined_count', {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });

    // Performance Composite Indexes
    await ensureIndex(queryInterface, 'events', ['start_at'], 'ix_events_start_at');
    await ensureIndex(queryInterface, 'events', ['status', 'is_deleted', 'start_at'], 'ix_events_status_del_start');
    await ensureIndex(queryInterface, 'events', ['community_id', 'status', 'is_deleted'], 'ix_events_comm_status_del');
    await ensureIndex(queryInterface, 'events', ['latitude', 'longitude'], 'ix_events_lat_lng');
    await ensureIndex(queryInterface, 'events', ['category_id', 'start_at'], 'ix_events_category_start');
  }

  // 2. Event Participants Deduplication & Unique Constraint
  if (has('event_participants')) {
    try {
      await database.query(`
        DELETE ep1 FROM event_participants ep1
        INNER JOIN event_participants ep2 
        WHERE ep1.event_id = ep2.event_id 
          AND ep1.user_id = ep2.user_id 
          AND ep1.id < ep2.id
      `, { type: QueryTypes.RAW });
      console.log('  Cleaned any duplicate event_participants rows.');
    } catch (dedupErr) {
      console.warn('  [WARN] Deduplication note:', dedupErr.message);
    }

    await ensureIndex(queryInterface, 'event_participants', ['event_id', 'user_id'], 'uq_ep_event_user', { unique: true });
    await ensureIndex(queryInterface, 'event_participants', ['event_id', 'status', 'is_deleted'], 'ix_ep_event_status_del');
    await ensureIndex(queryInterface, 'event_participants', ['user_id', 'status', 'is_deleted'], 'ix_ep_user_status_del');
  }

  // 3. Backfill counters
  if (has('events') && has('event_participants')) {
    try {
      await database.query(`
        UPDATE events e
        SET 
          going_count = (
            SELECT COUNT(*) FROM event_participants ep 
            WHERE ep.event_id = e.id AND ep.status = 'going' AND ep.is_deleted = 0
          ),
          interested_count = (
            SELECT COUNT(*) FROM event_participants ep 
            WHERE ep.event_id = e.id AND ep.status = 'interested' AND ep.is_deleted = 0
          ),
          declined_count = (
            SELECT COUNT(*) FROM event_participants ep 
            WHERE ep.event_id = e.id AND ep.status = 'declined' AND ep.is_deleted = 0
          )
        WHERE e.is_deleted = 0
      `, { type: QueryTypes.RAW });
      console.log('  Backfilled event participant counters.');
    } catch (backfillErr) {
      console.warn('  [WARN] Counter backfill note:', backfillErr.message);
    }
  }

  console.log('[012-events-hardening] UP complete.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  const dropIndexSilently = async (table, indexName) => {
    try {
      await queryInterface.removeIndex(table, indexName);
      console.log(`  Removed index ${indexName} from ${table}`);
    } catch (_) {}
  };

  console.log('[012-events-hardening] DOWN...');
  await dropIndexSilently('events', 'ix_events_start_at');
  await dropIndexSilently('events', 'ix_events_status_del_start');
  await dropIndexSilently('events', 'ix_events_comm_status_del');
  await dropIndexSilently('events', 'ix_events_lat_lng');
  await dropIndexSilently('events', 'ix_events_category_start');

  await dropIndexSilently('event_participants', 'uq_ep_event_user');
  await dropIndexSilently('event_participants', 'ix_ep_event_status_del');
  await dropIndexSilently('event_participants', 'ix_ep_user_status_del');
  console.log('[012-events-hardening] DOWN complete.');
};

export const version = '012-enterprise-events-hardening';
