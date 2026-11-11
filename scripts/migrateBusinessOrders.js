import { DataTypes } from 'sequelize';
import sequelize from '../src/config/db.js';
import { up, down, version } from './migrations/026-business-orders-and-items.js';

const MIGRATIONS_TABLE = 'schema_migrations';

const ensureMigrationsTable = async (queryInterface) => {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table : table.tableName || table.table_name
  );
  if (!tables.includes(MIGRATIONS_TABLE)) {
    await queryInterface.createTable(MIGRATIONS_TABLE, {
      version: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
      applied_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
  }
};

const run = async () => {
  const direction = process.argv[2] || 'up';
  if (!['up', 'down'].includes(direction)) {
    throw new Error('Migration direction must be "up" or "down".');
  }

  await sequelize.authenticate();
  const queryInterface = sequelize.getQueryInterface();
  await ensureMigrationsTable(queryInterface);
  const [rows] = await sequelize.query(
    'SELECT version FROM schema_migrations WHERE version = ?',
    { replacements: [version] }
  );
  const applied = rows.length > 0;

  if (direction === 'up') {
    if (!applied) {
      await up({ queryInterface });
      await queryInterface.bulkInsert(MIGRATIONS_TABLE, [{ version, applied_at: new Date() }]);
      console.log(`Applied migration ${version}.`);
    } else {
      await up({ queryInterface });
      console.log(`Migration ${version} verified.`);
    }
  } else if (applied) {
    await down({ queryInterface });
    await queryInterface.bulkDelete(MIGRATIONS_TABLE, { version });
    console.log(`Reverted migration ${version}.`);
  }
};

run()
  .catch((error) => {
    console.error('Business orders migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());

