/**
 * Structured Logger
 * ─────────────────────────────────────────────────────────────────────────────
 * Outputs JSON logs in production (machine-readable for Datadog / CloudWatch)
 * and pretty-prints in development.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const isProd = process.env.NODE_ENV === 'production';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const MIN_LEVEL = isProd ? LEVELS.info : LEVELS.debug;

const buildEntry = (level, category, message, meta = {}) => ({
  ts:       new Date().toISOString(),
  level,
  category,
  message,
  ...meta,
});

const write = (level, category, message, meta) => {
  if (LEVELS[level] > MIN_LEVEL) return;

  const entry = buildEntry(level, category, message, meta);

  if (isProd) {
    // Machine-readable JSON — one line per log event
    process.stdout.write(JSON.stringify(entry) + '\n');
  } else {
    // Coloured, human-readable
    const colors = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
    const reset  = '\x1b[0m';
    const color  = colors[level] || reset;
    const extra  = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    console.log(`${color}[${entry.ts}] ${level.toUpperCase()} [${category}] ${message}${extra}${reset}`);
  }
};

// ── Chat-specific structured log helpers ─────────────────────────────────────

export const logger = {
  error: (category, message, meta = {}) => write('error', category, message, meta),
  warn:  (category, message, meta = {}) => write('warn',  category, message, meta),
  info:  (category, message, meta = {}) => write('info',  category, message, meta),
  debug: (category, message, meta = {}) => write('debug', category, message, meta),

  // Specialised helpers for metrics-friendly observability
  messageSent: (meta) => write('info', 'MESSAGE', 'message_sent', { event: 'message_sent', ...meta }),
  messageDelivered: (meta) => write('info', 'RECEIPT', 'message_delivered', { event: 'message_delivered', ...meta }),
  messageRead: (meta) => write('info', 'RECEIPT', 'message_read', { event: 'message_read', ...meta }),
  uploadSuccess: (meta) => write('info', 'UPLOAD', 'upload_success', { event: 'upload_success', ...meta }),
  uploadFailure: (meta) => write('warn', 'UPLOAD', 'upload_failure', { event: 'upload_failure', ...meta }),
  socketConnect: (meta) => write('info', 'SOCKET', 'socket_connect', { event: 'socket_connect', ...meta }),
  socketDisconnect: (meta) => write('info', 'SOCKET', 'socket_disconnect', { event: 'socket_disconnect', ...meta }),
  auditAction: (meta) => write('info', 'AUDIT', 'audit_action', { event: 'audit_action', ...meta }),
  securityBlock: (meta) => write('warn', 'SECURITY', 'security_block', { event: 'security_block', ...meta }),
};

export default logger;
