import { DataTypes } from 'sequelize';
import sequelize from '../src/config/db.js';
import * as servicesHardening from './migrations/017-enterprise-services-hardening.js';
import * as subcategoriesAndKycLock from './migrations/018-service-subcategories-and-kyc-trade-lock.js';

const MIGRATIONS_TABLE = 'schema_migrations';
const migrations = [
  { ...servicesHardening, version: '017-enterprise-services-hardening' },
  { ...subcategoriesAndKycLock, version: '018-service-subcategories-and-kyc-trade-lock' },
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
      version: {
        type: DataTypes.STRING(255),
        primaryKey: true,
        allowNull: false,
      },
      applied_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });
  }

  const [appliedRows] = await sequelize.query(`SELECT version FROM ${MIGRATIONS_TABLE}`);
  const applied = new Set(appliedRows.map((r) => r.version));

  if (direction === 'up') {
    for (const m of migrations) {
      if (!applied.has(m.version)) {
        console.log(`Running migration: ${m.version}`);
        await m.up({ queryInterface, database: sequelize });
        await sequelize.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (version, applied_at) VALUES (?, NOW())`,
          { replacements: [m.version] }
        );
        console.log(`Applied migration: ${m.version}`);
      } else {
        console.log(`Migration already applied: ${m.version}`);
      }
    }
  } else {
    for (const m of [...migrations].reverse()) {
      if (applied.has(m.version)) {
        console.log(`Reverting migration: ${m.version}`);
        await m.down({ queryInterface, database: sequelize });
        await sequelize.query(
          `DELETE FROM ${MIGRATIONS_TABLE} WHERE version = ?`,
          { replacements: [m.version] }
        );
        console.log(`Reverted migration: ${m.version}`);
      }
    }
  }

  await sequelize.close();
  console.log('Migration finished successfully.');
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
