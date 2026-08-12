import OutboxEvent from '../../src/modules/outbox/outbox_event.model.js';
import sequelize from '../../src/config/db.js';

export const version = '006-outbox-events';

/**
 * Indexes:
 * - ix_outbox_status_available_at (status, available_at)
 *   Why: Phase 4 worker will poll pending events with
 *   WHERE status = 'pending' AND available_at <= NOW() ORDER BY available_at.
 * - uq_outbox_event_type_aggregate (event_type, aggregate_type, aggregate_id) UNIQUE
 *   Why: Prevents duplicate domain events for the same aggregate
 *   (e.g. one message.created per message id), supporting idempotency.
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
  model = OutboxEvent,
  queryInterface = sequelize.getQueryInterface(),
} = {}) => {
  console.log('[006-outbox-events] UP...');
  await model.sync();

  const tableName = typeof model.getTableName === 'function'
    ? model.getTableName()
    : 'outbox_events';

  await ensureIndex(
    queryInterface,
    tableName,
    ['status', 'available_at'],
    'ix_outbox_status_available_at',
  );
  await ensureIndex(
    queryInterface,
    tableName,
    ['event_type', 'aggregate_type', 'aggregate_id'],
    'uq_outbox_event_type_aggregate',
    { unique: true },
  );
  console.log('[006-outbox-events] UP complete.');
};

export const down = async ({
  queryInterface = sequelize.getQueryInterface(),
  model = OutboxEvent,
} = {}) => {
  console.log('[006-outbox-events] DOWN...');
  const tableName = typeof model.getTableName === 'function'
    ? model.getTableName()
    : 'outbox_events';

  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table : (table.tableName || table.table_name),
  );

  if (tables.includes(tableName)) {
    await removeIndexIfPresent(queryInterface, tableName, 'uq_outbox_event_type_aggregate');
    await removeIndexIfPresent(queryInterface, tableName, 'ix_outbox_status_available_at');
    await queryInterface.dropTable(tableName);
    console.log('  Dropped table: ' + tableName);
  } else {
    console.log('  Table not present: ' + tableName);
  }
  console.log('[006-outbox-events] DOWN complete.');
};
