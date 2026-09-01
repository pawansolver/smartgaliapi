import { Sequelize } from 'sequelize';
import env from './env.js';
import {
  dbQueriesTotal,
  dbQueryErrors,
  dbQueryDuration,
} from '../monitoring/metrics.js';

/**
 * Extract a low-cardinality operation label from a SQL string.
 * NEVER includes the SQL text itself as a label (high cardinality / sensitive).
 */
const getSqlOperation = (sql) => {
  if (typeof sql !== 'string') return 'OTHER';
  const first = sql.trimStart().split(/\s+/)[0]?.toUpperCase() || 'OTHER';
  return ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER'].includes(first)
    ? first
    : 'OTHER';
};

// Initialize Sequelize instance with environment configurations
const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  dialect: 'mysql',
  port: env.db.port,
  logging: env.nodeEnv === 'development' ? console.log : false,
  timezone: '+05:30',
  dialectOptions: {
    dateStrings: true,
    typeCast: true,
  },
  pool: {
    max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX) : (env.isProduction ? 10 : 3),
    min: 0,
    acquire: 30000,
    idle: 10000,
    evict: 5000,
  },
});

// ── DB Query Metrics — Sequelize 6 hooks ─────────────────────────────────────
// Store per-query start times keyed by a per-query context reference.
// Sequelize 6 passes the QueryInterface options object as the second argument
// to beforeQuery; we stamp it with a startTime so afterQuery can read it.
const HOOK_SUPPORTED = typeof sequelize.addHook === 'function';

if (HOOK_SUPPORTED) {
  try {
    sequelize.addHook('beforeQuery', (options) => {
      if (options && typeof options === 'object') {
        options.__metricStart = process.hrtime.bigint();
        const op = getSqlOperation(options.sql);
        dbQueriesTotal.inc({ operation: op });
      }
    });

    sequelize.addHook('afterQuery', (options) => {
      if (options && typeof options === 'object' && options.__metricStart) {
        const durationSec = Number(process.hrtime.bigint() - options.__metricStart) / 1e9;
        const op = getSqlOperation(options.sql);
        dbQueryDuration.observe({ operation: op }, durationSec);
        delete options.__metricStart;
      }
    });
  } catch (hookErr) {
    // Hook registration failed (e.g., unsupported in this Sequelize build).
    // Log a warning but do NOT crash the application — metrics are optional.
    console.warn('[metrics] Sequelize query hooks unavailable:', hookErr.message);
  }
}

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    // alter: false — new columns already added manually via ALTER TABLE scripts
    await sequelize.sync({ alter: false });
    console.log('Models synchronized.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    if (error.original?.code === 'ER_USER_LIMIT_REACHED' || error.parent?.code === 'ER_USER_LIMIT_REACHED') {
      console.error('\n⚠️  HOSTINGER / MYSQL RESOURCE LIMIT REACHED:');
      console.error('The database user has exceeded MySQL "max_connections_per_hour" (current limit: 500/hr).');
      console.error('To resolve this:');
      console.error('  1. In Hostinger hPanel -> phpMyAdmin / Databases, run: FLUSH USER_RESOURCES;');
      console.error('     Or create a new database user / reset password in hPanel and update .env.');
      console.error('  2. Or wait for the hourly window to reset.');
      console.error('  3. Or use a local MySQL server (localhost:3306) in .env for development.\n');
    }
    process.exit(1);
  }
};

export default sequelize;
