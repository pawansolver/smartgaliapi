import sequelize from '../../src/config/db.js';

export const version = '005-chat-indexes';

const ensureIndex = async (queryInterface, table, fields, name, options = {}) => {
  const indexes = await queryInterface.showIndex(table);
  const alreadyExists = indexes.some((idx) => idx.name === name);
  if (!alreadyExists) {
    await queryInterface.addIndex(table, fields, { ...options, name });
    console.log('  Added: ' + name);
  } else {
    console.log('  Skipped (exists): ' + name);
  }
};

const removeIndexIfPresent = async (queryInterface, table, name) => {
  const indexes = await queryInterface.showIndex(table);
  const target = indexes.find((idx) => idx.name === name);
  if (!target) return;
  // MySQL cannot drop an index that is the sole supporting index for a FK
  // constraint. If the FK still exists, skip silently.
  if (target.primary) {
    console.log('  Skipping primary key: ' + name);
    return;
  }
  try {
    await queryInterface.removeIndex(table, name);
    console.log('  Removed: ' + name);
  } catch (err) {
    if (err.original && err.original.code === 'ER_DROP_INDEX_FK') {
      console.log('  Skipped (FK constraint backing index, safe to leave): ' + name);
    } else {
      throw err;
    }
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[005-chat-indexes] UP...');
  await ensureIndex(queryInterface, 'chat_participants', ['chat_id', 'user_id'], 'uq_chat_participant_chat_user', { unique: true });
  await ensureIndex(queryInterface, 'chat_participants', ['user_id', 'is_deleted'], 'ix_chat_participants_user_id_is_deleted');
  await ensureIndex(queryInterface, 'chat_participants', ['chat_id', 'is_deleted'], 'ix_chat_participants_chat_id_is_deleted');
  await ensureIndex(queryInterface, 'messages', ['chat_id', 'is_deleted', 'id'], 'ix_messages_chat_id_deleted_id');
  await ensureIndex(queryInterface, 'messages', ['chat_id', 'message_type', 'is_deleted'], 'ix_messages_chat_id_type_deleted');
  await ensureIndex(queryInterface, 'chats', ['is_deleted', 'last_message_at'], 'ix_chats_deleted_last_message_at');
  await ensureIndex(queryInterface, 'message_receipts', ['user_id', 'read_at'], 'ix_message_receipts_user_id_read_at');
  console.log('[005-chat-indexes] UP complete.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[005-chat-indexes] DOWN...');
  const toRemove = [
    ['chat_participants', 'uq_chat_participant_chat_user'],
    ['chat_participants', 'ix_chat_participants_user_id_is_deleted'],
    ['chat_participants', 'ix_chat_participants_chat_id_is_deleted'],
    ['messages',          'ix_messages_chat_id_deleted_id'],
    ['messages',          'ix_messages_chat_id_type_deleted'],
    ['chats',             'ix_chats_deleted_last_message_at'],
    ['message_receipts',  'ix_message_receipts_user_id_read_at'],
  ];
  for (const [table, name] of toRemove) {
    await removeIndexIfPresent(queryInterface, table, name);
  }
  console.log('[005-chat-indexes] DOWN complete.');
};
