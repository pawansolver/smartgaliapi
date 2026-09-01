import { DataTypes, QueryTypes } from 'sequelize';
import sequelize from '../../src/config/db.js';

export const version = '010-enterprise-community';

const tableNames = async (queryInterface) => (await queryInterface.showAllTables())
  .map((table) => typeof table === 'string' ? table : (table.tableName || table.table_name));

const ensureColumn = async (queryInterface, table, column, definition) => {
  const description = await queryInterface.describeTable(table);
  if (!description[column]) await queryInterface.addColumn(table, column, definition);
};

const ensureIndex = async (queryInterface, table, fields, name, options = {}) => {
  const indexes = await queryInterface.showIndex(table);
  if (!indexes.some((index) => index.name === name)) {
    await queryInterface.addIndex(table, fields, { name, ...options });
  }
};

const ensureConstraint = async (queryInterface, table, options) => {
  const constraints = typeof queryInterface.showConstraint === 'function'
    ? await queryInterface.showConstraint(table)
    : [];
  if (!constraints.some((constraint) => constraint.constraintName === options.name)) {
    try {
      await queryInterface.addConstraint(table, options);
    } catch (error) {
      // Existing deployments may already have an equivalent FK with another name.
      if (!['ER_DUP_KEYNAME', 'ER_FK_DUP_NAME', 'SQLITE_ERROR'].includes(error.original?.code)) throw error;
    }
  }
};

export const up = async ({
  queryInterface = sequelize.getQueryInterface(),
  database = sequelize,
} = {}) => {
  const tables = await tableNames(queryInterface);
  const has = (name) => tables.includes(name);

  if (!has('community_invitations')) {
    await queryInterface.createTable('community_invitations', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      community_id: { type: DataTypes.BIGINT, allowNull: false },
      invited_user_id: { type: DataTypes.BIGINT, allowNull: false },
      invited_by: { type: DataTypes.BIGINT, allowNull: false },
      status: {
        type: DataTypes.ENUM('pending', 'accepted', 'declined', 'revoked'),
        allowNull: false,
        defaultValue: 'pending',
      },
      pending_key: { type: DataTypes.TINYINT, allowNull: true, defaultValue: 1 },
      responded_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    tables.push('community_invitations');
  }
  await ensureIndex(queryInterface, 'community_invitations', ['community_id', 'invited_user_id', 'pending_key'], 'uq_pending_community_invite', { unique: true });
  await ensureIndex(queryInterface, 'community_invitations', ['invited_user_id', 'status', 'created_at'], 'ix_user_community_invites');
  if (has('communities')) {
    await ensureConstraint(queryInterface, 'community_invitations', {
      fields: ['community_id'],
      type: 'foreign key',
      name: 'fk_community_invites_community',
      references: { table: 'communities', field: 'communityId' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
  }
  if (has('users')) {
    await ensureConstraint(queryInterface, 'community_invitations', {
      fields: ['invited_user_id'],
      type: 'foreign key',
      name: 'fk_community_invites_user',
      references: { table: 'users', field: 'userId' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    await ensureConstraint(queryInterface, 'community_invitations', {
      fields: ['invited_by'],
      type: 'foreign key',
      name: 'fk_community_invites_inviter',
      references: { table: 'users', field: 'userId' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
  }

  if (has('posts')) {
    await ensureColumn(queryInterface, 'posts', 'community_id', { type: DataTypes.BIGINT, allowNull: true });
    await ensureIndex(queryInterface, 'posts', ['community_id', 'visibility', 'created_at'], 'ix_posts_community_visibility_created');
    if (has('communities')) {
      await ensureConstraint(queryInterface, 'posts', {
        fields: ['community_id'],
        type: 'foreign key',
        name: 'fk_posts_community',
        references: { table: 'communities', field: 'communityId' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
  }

  if (has('community_join_requests')) {
    await ensureColumn(queryInterface, 'community_join_requests', 'pending_key', {
      type: DataTypes.TINYINT,
      allowNull: true,
    });
    const pendingRows = await database.query(
      `SELECT id, community_id, user_id FROM community_join_requests
       WHERE status = 'pending' AND is_deleted = 0 ORDER BY id ASC`,
      { type: QueryTypes.SELECT },
    );
    const seen = new Set();
    for (const row of pendingRows) {
      const key = `${row.community_id}:${row.user_id}`;
      if (seen.has(key)) {
        await queryInterface.bulkUpdate(
          'community_join_requests',
          { status: 'rejected', pending_key: null, reviewed_at: new Date(), remark: 'Superseded duplicate pending request' },
          { id: row.id },
        );
      } else {
        seen.add(key);
        await queryInterface.bulkUpdate('community_join_requests', { pending_key: 1 }, { id: row.id });
      }
    }
    await ensureIndex(
      queryInterface,
      'community_join_requests',
      ['community_id', 'user_id', 'pending_key'],
      'uq_community_pending_request',
      { unique: true },
    );
    await ensureIndex(queryInterface, 'community_join_requests', ['community_id', 'status', 'created_at'], 'ix_community_requests_status_created');
  }

  if (has('chats')) {
    await ensureColumn(queryInterface, 'chats', 'community_chat_key', {
      type: DataTypes.TINYINT,
      allowNull: true,
    });
    const communityChats = await database.query(
      `SELECT id, community_id FROM chats
       WHERE chat_type = 'community' AND is_deleted = 0 AND community_id IS NOT NULL ORDER BY id ASC`,
      { type: QueryTypes.SELECT },
    );
    const canonicalChats = new Map();
    for (const row of communityChats) {
      const key = String(row.community_id);
      if (canonicalChats.has(key)) {
        const canonicalChatId = canonicalChats.get(key);
        if (has('chat_participants')) {
          const duplicateParticipants = await database.query(
            `SELECT id, user_id FROM chat_participants
             WHERE chat_id = ? AND is_deleted = 0 ORDER BY id ASC`,
            { replacements: [row.id], type: QueryTypes.SELECT },
          );
          for (const participant of duplicateParticipants) {
            const existing = await database.query(
              `SELECT id FROM chat_participants
               WHERE chat_id = ? AND user_id = ? AND is_deleted = 0 LIMIT 1`,
              {
                replacements: [canonicalChatId, participant.user_id],
                type: QueryTypes.SELECT,
              },
            );
            if (existing.length) {
              await queryInterface.bulkUpdate(
                'chat_participants',
                { is_deleted: true, is_active: false },
                { id: participant.id },
              );
            } else {
              await queryInterface.bulkUpdate(
                'chat_participants',
                { chat_id: canonicalChatId },
                { id: participant.id },
              );
            }
          }
        }
        if (has('messages')) {
          await queryInterface.bulkUpdate('messages', { chat_id: canonicalChatId }, { chat_id: row.id });
        }
        await queryInterface.bulkUpdate('chats', { is_deleted: true, is_active: false, community_chat_key: null }, { id: row.id });
      } else {
        canonicalChats.set(key, row.id);
        await queryInterface.bulkUpdate('chats', { community_chat_key: 1 }, { id: row.id });
      }
    }
    await ensureIndex(
      queryInterface,
      'chats',
      ['community_id', 'community_chat_key'],
      'uq_active_community_chat',
      { unique: true },
    );
  }

  if (has('community_members')) {
    await ensureIndex(queryInterface, 'community_members', ['community_id', 'status', 'role'], 'ix_community_members_status_role');
    await ensureIndex(queryInterface, 'community_members', ['user_id', 'status', 'community_id'], 'ix_user_active_communities');
  }
  if (has('chat_participants')) {
    await ensureColumn(queryInterface, 'chat_participants', 'membership_key', {
      type: DataTypes.TINYINT,
      allowNull: true,
    });
    const participants = await database.query(
      `SELECT id, chat_id, user_id FROM chat_participants
       WHERE is_deleted = 0 ORDER BY id ASC`,
      { type: QueryTypes.SELECT },
    );
    const seenParticipants = new Set();
    for (const row of participants) {
      const key = `${row.chat_id}:${row.user_id}`;
      if (seenParticipants.has(key)) {
        await queryInterface.bulkUpdate('chat_participants', { is_deleted: true, is_active: false, membership_key: null }, { id: row.id });
      } else {
        seenParticipants.add(key);
        await queryInterface.bulkUpdate('chat_participants', { membership_key: 1 }, { id: row.id });
      }
    }
    await ensureIndex(queryInterface, 'chat_participants', ['chat_id', 'user_id', 'membership_key'], 'uq_chat_participant', { unique: true });
  }

  if (has('communities') && has('community_members') && has('posts')) {
    await database.query(
      `UPDATE communities c SET
       members_count = (SELECT COUNT(*) FROM community_members m
         WHERE m.community_id = c.communityId AND m.status = 'active' AND m.is_deleted = 0),
       posts_count = (SELECT COUNT(*) FROM posts p
         WHERE p.community_id = c.communityId AND p.is_deleted = 0)`,
    );
  }
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  const tables = await tableNames(queryInterface);
  const removeIndex = async (table, name) => {
    if (!tables.includes(table)) return;
    const indexes = await queryInterface.showIndex(table);
    if (indexes.some((index) => index.name === name)) await queryInterface.removeIndex(table, name);
  };
  await removeIndex('chat_participants', 'uq_chat_participant');
  await removeIndex('community_members', 'ix_user_active_communities');
  await removeIndex('community_members', 'ix_community_members_status_role');
  await removeIndex('chats', 'uq_active_community_chat');
  await removeIndex('community_join_requests', 'uq_community_pending_request');
  await removeIndex('community_join_requests', 'ix_community_requests_status_created');
  await removeIndex('posts', 'ix_posts_community_visibility_created');
  await removeIndex('community_invitations', 'uq_pending_community_invite');
  await removeIndex('community_invitations', 'ix_user_community_invites');
  if (tables.includes('posts') && typeof queryInterface.showConstraint === 'function') {
    const constraints = await queryInterface.showConstraint('posts');
    if (constraints.some((constraint) => constraint.constraintName === 'fk_posts_community')) {
      await queryInterface.removeConstraint('posts', 'fk_posts_community');
    }
  }
  const removeColumn = async (table, column) => {
    if (!tables.includes(table)) return;
    const description = await queryInterface.describeTable(table);
    if (description[column]) await queryInterface.removeColumn(table, column);
  };
  await removeColumn('chat_participants', 'membership_key');
  await removeColumn('chats', 'community_chat_key');
  await removeColumn('community_join_requests', 'pending_key');
  await removeColumn('posts', 'community_id');
  if (tables.includes('community_invitations')) await queryInterface.dropTable('community_invitations');
};
