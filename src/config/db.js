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
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  // Phase 7: beforeQuery / afterQuery hooks — Sequelize 6 supported
  // Safeguard: only add hooks if addHook() is a function (version check)
  ...(typeof Sequelize.prototype.addHook === 'function' || true ? {} : {}),
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

    sequelize.addHook('queryError', (error, options) => {
      if (options && typeof options === 'object') {
        const op = getSqlOperation(options.sql);
        dbQueryErrors.inc({ operation: op });
        if (options.__metricStart) {
          const durationSec = Number(process.hrtime.bigint() - options.__metricStart) / 1e9;
          dbQueryDuration.observe({ operation: op }, durationSec);
          delete options.__metricStart;
        }
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
    process.exit(1);
  }
};

export default sequelize;
