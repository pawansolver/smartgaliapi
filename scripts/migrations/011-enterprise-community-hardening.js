import { DataTypes, QueryTypes } from 'sequelize';
import sequelize from '../../src/config/db.js';

const tableNames = async (queryInterface) => {
  if (typeof queryInterface.showAllTables === 'function') {
    const raw = await queryInterface.showAllTables();
    return raw.map((item) => (typeof item === 'string' ? item : item.tableName || item.name));
  }
  return [];
};

const ensureColumn = async (queryInterface, table, column, definition) => {
  const description = await queryInterface.describeTable(table);
  if (!description[column]) {
    await queryInterface.addColumn(table, column, definition);
  }
};

const ensureIndex = async (queryInterface, table, fields, name, options = {}) => {
  const indexes = await queryInterface.showIndex(table);
  const exists = indexes.some((idx) => idx.name === name);
  if (!exists) {
    await queryInterface.addIndex(table, fields, { name, ...options });
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface(), database = sequelize } = {}) => {
  const tables = await tableNames(queryInterface);
  const has = (t) => tables.includes(t);

  // 1. Communities Table Geo Fields & Indexes
  if (has('communities')) {
    await ensureColumn(queryInterface, 'communities', 'latitude', { type: DataTypes.DECIMAL(10, 8), allowNull: true });
    await ensureColumn(queryInterface, 'communities', 'longitude', { type: DataTypes.DECIMAL(11, 8), allowNull: true });
    await ensureColumn(queryInterface, 'communities', 'location_name', { type: DataTypes.STRING(255), allowNull: true });
    await ensureColumn(queryInterface, 'communities', 'discovery_radius', { type: DataTypes.DECIMAL(6, 2), defaultValue: 25.00, allowNull: false });
    await ensureIndex(queryInterface, 'communities', ['latitude', 'longitude'], 'ix_communities_lat_lng');
    await ensureIndex(queryInterface, 'communities', ['status', 'is_deleted', 'category_id'], 'ix_communities_status_del_cat');
  }

  // 2. Community Audit Logs Table
  if (!has('community_audit_logs')) {
    await queryInterface.createTable('community_audit_logs', {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      community_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      actor_user_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      action: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      target_user_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      target_entity_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      target_entity_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      old_value: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      new_value: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      request_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });
    await ensureIndex(queryInterface, 'community_audit_logs', ['community_id', 'created_at'], 'ix_audit_comm_created');
    await ensureIndex(queryInterface, 'community_audit_logs', ['actor_user_id', 'action'], 'ix_audit_actor_action');
  }

  // 3. Composite Indexes for Community Sub-tables
  if (has('community_members')) {
    await ensureIndex(queryInterface, 'community_members', ['community_id', 'status', 'role'], 'ix_cm_comm_status_role');
    await ensureIndex(queryInterface, 'community_members', ['user_id', 'status'], 'ix_cm_user_status');
  }

  if (has('community_announcements')) {
    await ensureIndex(queryInterface, 'community_announcements', ['community_id', 'is_pinned', 'created_at'], 'ix_ca_comm_pinned_created');
  }

  if (has('community_documents')) {
    await ensureIndex(queryInterface, 'community_documents', ['community_id', 'created_at'], 'ix_cd_comm_created');
  }

  if (has('community_media')) {
    await ensureIndex(queryInterface, 'community_media', ['community_id', 'created_at'], 'ix_cmedia_comm_created');
  }

  if (has('community_polls')) {
    await ensureIndex(queryInterface, 'community_polls', ['community_id', 'created_at'], 'ix_cp_comm_created');
    await ensureIndex(queryInterface, 'community_polls', ['community_id', 'expires_at'], 'ix_cp_comm_expires');
  }

  if (has('community_poll_votes')) {
    await ensureIndex(queryInterface, 'community_poll_votes', ['poll_id', 'user_id'], 'uq_cpv_poll_user', { unique: true });
    await ensureIndex(queryInterface, 'community_poll_votes', ['poll_id'], 'ix_cpv_poll');
  }
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  const tables = await tableNames(queryInterface);
  if (tables.includes('community_audit_logs')) {
    await queryInterface.dropTable('community_audit_logs');
  }
};
