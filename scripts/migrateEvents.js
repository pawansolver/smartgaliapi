import { DataTypes } from 'sequelize';
import sequelize from '../src/config/db.js';
import * as eventsHardening from './migrations/012-enterprise-events-hardening.js';

const MIGRATIONS_TABLE = 'schema_migrations';
const migrations = [
  { ...eventsHardening, version: '012-enterprise-events-hardening' },
];

const run = async () => {
  const direction = process.argv[2] || 'up';
  if (!['up', 'down'].includes(direction)) throw new Error('Migration direction must be "up" or "down".');
  await sequelize.authenticate();
  const queryInterface = sequelize.getQueryInterface();
  const rawTables = await queryInterface.showAllTables();
  const tables = rawTables.map((table) =>
    typeof table === 'string' ? table : (table.tableName || table.table_name));
  if (!tables.includes(MIGRATIONS_TABLE)) {
    await queryInterface.createTable(MIGRATIONS_TABLE, {
      version: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
      applied_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
  }

  for (const migration of direction === 'up' ? migrations : [...migrations].reverse()) {
    const [rows] = await sequelize.query('SELECT version FROM schema_migrations WHERE version = ?', {
      replacements: [migration.version],
    });
    if (direction === 'up' && rows.length === 0) {
      await migration.up({ queryInterface, database: sequelize });
      await queryInterface.bulkInsert(MIGRATIONS_TABLE, [{ version: migration.version, applied_at: new Date() }]);
      console.log(`Applied migration ${migration.version}.`);
    } else if (direction === 'down' && rows.length > 0) {
      await migration.down({ queryInterface, database: sequelize });
      await queryInterface.bulkDelete(MIGRATIONS_TABLE, { version: migration.version });
      console.log(`Reverted migration ${migration.version}.`);
    } else {
      console.log(`Migration ${migration.version} is ${rows.length ? 'already applied' : 'not applied'}.`);
    }
  }
};

run()
  .catch((error) => {
    console.error('Events migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
