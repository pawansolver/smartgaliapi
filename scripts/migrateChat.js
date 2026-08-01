import { DataTypes } from 'sequelize';
import sequelize from '../src/config/db.js';
import * as chatMediaMigration from './migrations/002-chat-media-module.js';
import * as messagePinsMigration from './migrations/003-message-pins.js';

const MIGRATIONS_TABLE = 'schema_migrations';
const migrations = [chatMediaMigration, messagePinsMigration];

const ensureMigrationsTable = async (queryInterface) => {
  const tables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table : (table.tableName || table.table_name)
  );
  if (!tables.includes(MIGRATIONS_TABLE)) {
    await queryInterface.createTable(MIGRATIONS_TABLE, {
      version: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
      applied_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
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

  if (direction === 'up') {
    for (const migration of migrations) {
      const [rows] = await sequelize.query(
        'SELECT version FROM schema_migrations WHERE version = ?',
        { replacements: [migration.version] },
      );
      if (rows.length === 0) {
        await migration.up();
        await queryInterface.bulkInsert(MIGRATIONS_TABLE, [
          { version: migration.version, applied_at: new Date() },
        ]);
        console.log(`Applied migration ${migration.version}.`);
      } else {
        console.log(`Migration ${migration.version} is already applied.`);
      }
    }
  } else {
    for (const migration of [...migrations].reverse()) {
      const [rows] = await sequelize.query(
        'SELECT version FROM schema_migrations WHERE version = ?',
        { replacements: [migration.version] },
      );
      if (rows.length > 0) {
        await migration.down();
        await queryInterface.bulkDelete(MIGRATIONS_TABLE, { version: migration.version });
        console.log(`Reverted migration ${migration.version}.`);
      } else {
        console.log(`Migration ${migration.version} is not applied.`);
      }
    }
  }
};

run()
  .catch((error) => {
    console.error('Chat migration failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
