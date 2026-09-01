import { Op } from 'sequelize';
import Message from '../modules/message/message.model.js';
import User from '../modules/user/user.model.js';
import UserProfile from '../modules/userProfile/userProfile.model.js';
import { logger } from './logger.js';

/**
 * Search Abstraction Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Controller contract is fixed. Internally this can be swapped from
 * SQL → Elasticsearch/OpenSearch/MeiliSearch without touching controllers.
 *
 * Current implementation: SQL LIKE (works for < 1M messages per chat).
 * To migrate to ES: replace the body of `searchMessages()` only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Shared message includes ───────────────────────────────────────────────────
const SEARCH_INCLUDES = [
  {
    model: User,
    as:    'sender',
    attributes: ['userId', 'userName'],
    include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl'] }],
  },
  {
    model:      Message,
    as:         'repliedMessage',
    attributes: ['id', 'message', 'message_type', 'sender_id'],
  },
];

/**
 * Search messages in a single chat.
 *
 * @param {object} params
 * @param {string|number} params.chatId
 * @param {string}        params.query      - search term
 * @param {number}        params.limit      - max results (capped at 100)
 * @param {string}        params.beforeId   - cursor for pagination
 * @param {string}        params.messageType - optional filter (text|image|...)
 *
 * @returns {Promise<{ hits: Message[], total: number, engine: string }>}
 */
export const searchMessages = async ({
  chatId,
  query,
  limit      = 30,
  beforeId   = null,
  messageType = null,
}) => {
  const safeLimit = Math.min(Number(limit) || 30, 100);

  const where = {
    chat_id:    chatId,
    is_deleted: false,
    message:    { [Op.like]: `%${query.trim()}%` },
  };

  if (beforeId)    where.id           = { [Op.lt]: BigInt(beforeId) };
  if (messageType) where.message_type = messageType;

  const [hits, total] = await Promise.all([
    Message.findAll({
      where,
      include: SEARCH_INCLUDES,
      order:   [['id', 'DESC']],
      limit:   safeLimit,
    }),
    Message.count({ where }),
  ]);

  logger.debug('SEARCH', `SQL search in chat ${chatId}`, {
    chatId, query, hits: hits.length, total,
  });

  return { hits, total, engine: 'sql' };
};

/**
 * Global search across all chats that a user participates in.
 * (Useful for a universal search bar at the app level.)
 */
export const searchAcrossMyChats = async ({
  chatIds,
  query,
  limit = 30,
}) => {
  const safeLimit = Math.min(Number(limit) || 30, 100);

  const where = {
    chat_id:    { [Op.in]: chatIds },
    is_deleted: false,
    message:    { [Op.like]: `%${query.trim()}%` },
  };

  const hits = await Message.findAll({
    where,
    include: SEARCH_INCLUDES,
    order:   [['id', 'DESC']],
    limit:   safeLimit,
  });

  return { hits, total: hits.length, engine: 'sql' };
};
