import { DataTypes } from 'sequelize';
import sequelize from '../../src/config/db.js';
import MessageReceipt from '../../src/modules/message_receipt/message_receipt.model.js';
import MessageReaction from '../../src/modules/message_reaction/message_reaction.model.js';
import MessageDeletion from '../../src/modules/message_deletion/message_deletion.model.js';
import AuditLog from '../../src/modules/audit_log/audit_log.model.js';

export const version = '002-chat-media-module';

const enterpriseModels = [
  MessageReceipt,
  MessageReaction,
  MessageDeletion,
  AuditLog,
];

const chatColumns = {
  name: { type: DataTypes.STRING(120), allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  avatar_url: { type: DataTypes.STRING(512), allowNull: true },
  last_message_id: { type: DataTypes.BIGINT, allowNull: true },
  last_message_at: { type: DataTypes.DATE, allowNull: true },
  is_pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
};

const participantColumns = {
  last_read_message_id: { type: DataTypes.BIGINT, allowNull: true },
  unread_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  is_muted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  muted_until: { type: DataTypes.DATE, allowNull: true },
  nickname: { type: DataTypes.STRING(80), allowNull: true },
  is_pinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
};

const messageColumns = {
  idempotency_key: { type: DataTypes.STRING(128), allowNull: true },
  message_type: {
    type: DataTypes.ENUM(
      'text',
      'image',
      'video',
      'audio',
      'document',
      'location',
      'contact',
      'sticker',
      'gif',
    ),
    allowNull: false,
    defaultValue: 'text',
  },
  media_url: { type: DataTypes.STRING(512), allowNull: true },
  media_metadata: { type: DataTypes.JSON, allowNull: true },
  reply_to: { type: DataTypes.BIGINT, allowNull: true },
  delivered_at: { type: DataTypes.DATE, allowNull: true },
  read_at: { type: DataTypes.DATE, allowNull: true },
  is_read: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  is_edited: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  edited_at: { type: DataTypes.DATE, allowNull: true },
  reactions: { type: DataTypes.JSON, allowNull: true },
  is_forwarded: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  location_lat: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
  location_lng: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
  deleted_for: { type: DataTypes.JSON, allowNull: true },
};

const ensureColumns = async (queryInterface, table, columns) => {
  const description = await queryInterface.describeTable(table);
  for (const [column, definition] of Object.entries(columns)) {
    if (!description[column]) {
      await queryInterface.addColumn(table, column, definition);
      description[column] = definition;
    }
  }
};

const ensureIndex = async (queryInterface, table, fields, name, options = {}) => {
  const indexes = await queryInterface.showIndex(table);
  const matchesFields = (index) => {
    const existingFields = (index.fields || []).map((field) =>
      field.attribute || field.name
    );
    return existingFields.length === fields.length
      && existingFields.every((field, position) => field === fields[position])
      && (!options.unique || index.unique === true);
  };
  if (!indexes.some((index) => index.name === name || matchesFields(index))) {
    await queryInterface.addIndex(table, fields, { ...options, name });
  }
};

const removeIndexIfPresent = async (queryInterface, table, name) => {
  const indexes = await queryInterface.showIndex(table);
  if (indexes.some((index) => index.name === name)) {
    await queryInterface.removeIndex(table, name);
  }
};

const removeColumns = async (queryInterface, table, columns) => {
  const description = await queryInterface.describeTable(table);
  for (const column of [...Object.keys(columns)].reverse()) {
    if (description[column]) await queryInterface.removeColumn(table, column);
  }
};

export const up = async ({
  queryInterface = sequelize.getQueryInterface(),
  models = enterpriseModels,
} = {}) => {
  await ensureColumns(queryInterface, 'chats', chatColumns);
  await ensureColumns(queryInterface, 'chat_participants', participantColumns);
  await ensureColumns(queryInterface, 'messages', messageColumns);

  await ensureIndex(
    queryInterface,
    'messages',
    ['idempotency_key'],
    'uq_message_idempotency_key',
    { unique: true },
  );
  await ensureIndex(
    queryInterface,
    'messages',
    ['chat_id', 'id'],
    'ix_messages_chat_id_id',
  );
  await ensureIndex(
    queryInterface,
    'messages',
    ['sender_id'],
    'ix_messages_sender_id',
  );

  for (const model of models) await model.sync();
};

export const down = async ({
  queryInterface = sequelize.getQueryInterface(),
  models = enterpriseModels,
} = {}) => {
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    typeof table === 'string' ? table : (table.tableName || table.table_name)
  );
  for (const model of [...models].reverse()) {
    const tableName = model.getTableName();
    if (existingTables.includes(tableName)) await queryInterface.dropTable(tableName);
  }

  await removeIndexIfPresent(queryInterface, 'messages', 'ix_messages_sender_id');
  await removeIndexIfPresent(queryInterface, 'messages', 'ix_messages_chat_id_id');
  await removeIndexIfPresent(queryInterface, 'messages', 'uq_message_idempotency_key');
  await removeColumns(queryInterface, 'messages', messageColumns);
  await removeColumns(queryInterface, 'chat_participants', participantColumns);
  await removeColumns(queryInterface, 'chats', chatColumns);
};
