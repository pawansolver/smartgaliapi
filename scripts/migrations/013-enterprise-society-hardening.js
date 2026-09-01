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
  try {
    const description = await queryInterface.describeTable(table);
    if (!description[column]) {
      await queryInterface.addColumn(table, column, definition);
      console.log(`  Added column ${column} to ${table}`);
    }
  } catch (err) {
    console.warn(`  [WARN] ensureColumn ${column} on ${table}:`, err.message);
  }
};

const ensureIndex = async (queryInterface, table, fields, name, options = {}) => {
  try {
    const indexes = await queryInterface.showIndex(table);
    const exists = indexes.some((idx) => idx.name === name);
    if (!exists) {
      await queryInterface.addIndex(table, fields, { name, ...options });
      console.log(`  Added index ${name} on ${table}`);
    }
  } catch (err) {
    console.warn(`  [WARN] ensureIndex ${name} on ${table}:`, err.message);
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface(), database = sequelize } = {}) => {
  const tables = await tableNames(queryInterface);
  const has = (t) => tables.includes(t);

  console.log('[013-enterprise-society-hardening] UP...');

  // 1. Create society_poll_votes Table
  if (!has('society_poll_votes')) {
    await queryInterface.createTable('society_poll_votes', {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      poll_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      society_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      option_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
    });
    console.log('  Created table society_poll_votes');
  }
  await ensureIndex(queryInterface, 'society_poll_votes', ['poll_id', 'user_id'], 'uq_society_poll_votes_poll_user', { unique: true });
  await ensureIndex(queryInterface, 'society_poll_votes', ['poll_id', 'option_index'], 'ix_society_poll_votes_poll_option');
  await ensureIndex(queryInterface, 'society_poll_votes', ['society_id', 'user_id'], 'ix_society_poll_votes_soc_user');

  // 2. Create society_audit_logs Table
  if (!has('society_audit_logs')) {
    await queryInterface.createTable('society_audit_logs', {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      society_id: {
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
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false,
      },
    });
    console.log('  Created table society_audit_logs');
  }
  await ensureIndex(queryInterface, 'society_audit_logs', ['society_id', 'created_at'], 'ix_society_audit_logs_soc_created');
  await ensureIndex(queryInterface, 'society_audit_logs', ['actor_user_id', 'action'], 'ix_society_audit_logs_actor_action');
  await ensureIndex(queryInterface, 'society_audit_logs', ['target_user_id'], 'ix_society_audit_logs_target_user');

  // 3. Society Announcements Enterprise Fields & Indexes
  if (has('society_announcements')) {
    await ensureColumn(queryInterface, 'society_announcements', 'priority', {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      defaultValue: 'medium',
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'society_announcements', 'is_pinned', {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'society_announcements', 'category', {
      type: DataTypes.STRING(100),
      defaultValue: 'general',
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'society_announcements', 'expires_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await ensureIndex(queryInterface, 'society_announcements', ['society_id', 'is_pinned', 'created_at'], 'ix_society_announcements_soc_pinned_created');
    await ensureIndex(queryInterface, 'society_announcements', ['society_id', 'is_deleted', 'created_at'], 'ix_society_announcements_soc_del_created');
  }

  // 4. Society Complaints Enterprise Fields & Indexes
  if (has('society_complaints')) {
    await ensureColumn(queryInterface, 'society_complaints', 'category', {
      type: DataTypes.STRING(100),
      defaultValue: 'general',
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'society_complaints', 'priority', {
      type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
      defaultValue: 'medium',
      allowNull: false,
    });
    await ensureColumn(queryInterface, 'society_complaints', 'assigned_to', {
      type: DataTypes.BIGINT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'society_complaints', 'resolved_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'society_complaints', 'closed_at', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await ensureIndex(queryInterface, 'society_complaints', ['society_id', 'status', 'is_deleted'], 'ix_society_complaints_soc_status_del');
    await ensureIndex(queryInterface, 'society_complaints', ['society_id', 'user_id', 'is_deleted'], 'ix_society_complaints_soc_user_del');
    await ensureIndex(queryInterface, 'society_complaints', ['society_id', 'assigned_to'], 'ix_society_complaints_soc_assigned');
  }

  // 5. Society Facilities Enterprise Fields & Indexes
  if (has('society_facilities')) {
    await ensureColumn(queryInterface, 'society_facilities', 'operating_hours', {
      type: DataTypes.STRING(255),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'society_facilities', 'booking_rules', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'society_facilities', 'max_capacity', {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    await ensureIndex(queryInterface, 'society_facilities', ['society_id', 'is_active', 'is_deleted'], 'ix_society_facilities_soc_active_del');
  }

  // 6. Society Visitors Enterprise Fields & Indexes
  if (has('society_visitors')) {
    await ensureColumn(queryInterface, 'society_visitors', 'flat_no', {
      type: DataTypes.STRING(50),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'society_visitors', 'expected_time', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'society_visitors', 'approved_by', {
      type: DataTypes.BIGINT,
      allowNull: true,
    });
    await ensureIndex(queryInterface, 'society_visitors', ['society_id', 'status', 'is_deleted'], 'ix_society_visitors_soc_status_del');
    await ensureIndex(queryInterface, 'society_visitors', ['society_id', 'user_id', 'is_deleted'], 'ix_society_visitors_soc_user_del');
    await ensureIndex(queryInterface, 'society_visitors', ['society_id', 'created_at'], 'ix_society_visitors_soc_created');
  }

  // 7. Society Parkings Indexes
  if (has('society_parkings')) {
    await ensureIndex(queryInterface, 'society_parkings', ['society_id', 'parking_slot_no', 'is_deleted'], 'ix_society_parkings_soc_slot_del');
    await ensureIndex(queryInterface, 'society_parkings', ['society_id', 'user_id', 'is_deleted'], 'ix_society_parkings_soc_user_del');
  }

  // 8. Society Members Indexes
  if (has('society_members')) {
    await ensureIndex(queryInterface, 'society_members', ['society_id', 'user_id', 'is_deleted'], 'ix_society_members_soc_user_del');
    await ensureIndex(queryInterface, 'society_members', ['society_id', 'status', 'is_deleted'], 'ix_society_members_soc_status_del');
    await ensureIndex(queryInterface, 'society_members', ['society_id', 'role', 'status'], 'ix_society_members_soc_role_status');
  }

  // 9. Society Profiles Indexes
  if (has('society_profiles')) {
    await ensureIndex(queryInterface, 'society_profiles', ['user_id', 'is_deleted'], 'ix_society_profiles_user_del');
    await ensureIndex(queryInterface, 'society_profiles', ['is_active', 'is_deleted'], 'ix_society_profiles_active_del');
  }

  // 10. Society Polls Indexes
  if (has('society_polls')) {
    await ensureIndex(queryInterface, 'society_polls', ['society_id', 'status', 'is_deleted'], 'ix_society_polls_soc_status_del');
  }

  console.log('[013-enterprise-society-hardening] UP complete.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  const dropIndexSilently = async (table, indexName) => {
    try {
      await queryInterface.removeIndex(table, indexName);
      console.log(`  Removed index ${indexName} from ${table}`);
    } catch (_) {}
  };

  console.log('[013-enterprise-society-hardening] DOWN...');
  await dropIndexSilently('society_poll_votes', 'uq_society_poll_votes_poll_user');
  await dropIndexSilently('society_poll_votes', 'ix_society_poll_votes_poll_option');
  await dropIndexSilently('society_poll_votes', 'ix_society_poll_votes_soc_user');

  await dropIndexSilently('society_audit_logs', 'ix_society_audit_logs_soc_created');
  await dropIndexSilently('society_audit_logs', 'ix_society_audit_logs_actor_action');
  await dropIndexSilently('society_audit_logs', 'ix_society_audit_logs_target_user');

  await dropIndexSilently('society_announcements', 'ix_society_announcements_soc_pinned_created');
  await dropIndexSilently('society_announcements', 'ix_society_announcements_soc_del_created');

  await dropIndexSilently('society_complaints', 'ix_society_complaints_soc_status_del');
  await dropIndexSilently('society_complaints', 'ix_society_complaints_soc_user_del');
  await dropIndexSilently('society_complaints', 'ix_society_complaints_soc_assigned');

  await dropIndexSilently('society_facilities', 'ix_society_facilities_soc_active_del');
  await dropIndexSilently('society_visitors', 'ix_society_visitors_soc_status_del');
  await dropIndexSilently('society_visitors', 'ix_society_visitors_soc_user_del');
  await dropIndexSilently('society_visitors', 'ix_society_visitors_soc_created');

  await dropIndexSilently('society_parkings', 'ix_society_parkings_soc_slot_del');
  await dropIndexSilently('society_parkings', 'ix_society_parkings_soc_user_del');

  await dropIndexSilently('society_members', 'ix_society_members_soc_user_del');
  await dropIndexSilently('society_members', 'ix_society_members_soc_status_del');
  await dropIndexSilently('society_members', 'ix_society_members_soc_role_status');

  await dropIndexSilently('society_profiles', 'ix_society_profiles_user_del');
  await dropIndexSilently('society_profiles', 'ix_society_profiles_active_del');
  await dropIndexSilently('society_polls', 'ix_society_polls_soc_status_del');

  console.log('[013-enterprise-society-hardening] DOWN complete.');
};

export const version = '013-enterprise-society-hardening';
