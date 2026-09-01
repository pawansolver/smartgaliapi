import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { OUTBOX_STATUS, OUTBOX_STATUS_VALUES } from './outbox.events.js';

/**
 * OutboxEvent — transactional outbox for durable domain events.
 *
 * Written inside the same DB transaction as the domain write so that
 * Message + Chat update + Unread + Outbox either ALL commit or ALL roll back.
 *
 * Processing / publishing is handled outside the transaction (Phase 3
 * processor abstraction; Phase 4 will add BullMQ workers).
 */
const OutboxEvent = sequelize.define('OutboxEvent', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  event_type: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: 'Domain event name, e.g. message.created',
  },
  aggregate_type: {
    type: DataTypes.STRING(64),
    allowNull: false,
    comment: 'Aggregate root type, e.g. message',
  },
  aggregate_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    comment: 'ID of the related aggregate',
  },
  payload: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'Compact event data for consumers (no secrets)',
  },
  status: {
    type: DataTypes.ENUM(...OUTBOX_STATUS_VALUES),
    allowNull: false,
    defaultValue: OUTBOX_STATUS.PENDING,
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  available_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'When the event becomes eligible for processing',
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  tableName: 'outbox_events',
  indexes: [
    // Phase 4 worker polls: WHERE status = 'pending' AND available_at <= NOW()
    {
      fields: ['status', 'available_at'],
      name: 'ix_outbox_status_available_at',
    },
    // One logical event per aggregate (prevents duplicate message.created)
    {
      unique: true,
      fields: ['event_type', 'aggregate_type', 'aggregate_id'],
      name: 'uq_outbox_event_type_aggregate',
    },
  ],
});

export default OutboxEvent;
