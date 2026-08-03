import { DataTypes } from 'sequelize';
import sequelize from '../src/config/db.js';
import { down, up, version } from './migrations/004-auth-redesign.js';

const MIGRATIONS_TABLE = 'schema_migrations';

const tableNames = async (queryInterface) =>
  (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table : (table.tableName || table.table_name)
  );

const run = async () => {
  const direction = process.argv[2] || 'up';
  if (!['up', 'down'].includes(direction)) {
    throw new Error('Migration direction must be "up" or "down".');
  }
  await sequelize.authenticate();
  const queryInterface = sequelize.getQueryInterface();
  if (!(await tableNames(queryInterface)).includes(MIGRATIONS_TABLE)) {
    await queryInterface.createTable(MIGRATIONS_TABLE, {
      version: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
      applied_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
  }
  const [rows] = await sequelize.query(
    'SELECT version FROM schema_migrations WHERE version = ?',
    { replacements: [version] },
  );
  const applied = rows.length > 0;
  if (direction === 'up' && !applied) {
    await up();
    await queryInterface.bulkInsert(MIGRATIONS_TABLE, [{ version, applied_at: new Date() }]);
    console.log(`Applied migration ${version}.`);
  } else if (direction === 'down' && applied) {
    await down();
    await queryInterface.bulkDelete(MIGRATIONS_TABLE, { version });
    console.log(`Reverted migration ${version}.`);
  } else {
    console.log(`Migration ${version} is ${applied ? 'already applied' : 'not applied'}.`);
  }
};

run()
  .catch((error) => {
    console.error('Auth migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
