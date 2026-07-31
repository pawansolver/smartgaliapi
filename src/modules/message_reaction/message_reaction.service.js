import sequelize from '../../config/db.js';
import MessageReaction from './message_reaction.model.js';
import Message from '../message/message.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. TOGGLE REACTION (Add if not present, remove if exists)
//    Returns { action: 'added'|'removed', emoji, userId, reactionsSummary }
// ─────────────────────────────────────────────────────────────────────────────
export const toggleReaction = async ({ messageId, userId, emoji }) => {
  if (!emoji || typeof emoji !== 'string' || emoji.length > 16) {
    throw new Error('Invalid emoji');
  }

  const existing = await MessageReaction.findOne({
    where: { message_id: messageId, user_id: userId, emoji },
  });

  let action;
  if (existing) {
    await existing.destroy();
    action = 'removed';
  } else {
    await MessageReaction.create({ message_id: messageId, user_id: userId, emoji });
    action = 'added';
  }

  // Return updated summary for the message
  const summary = await getReactionSummary(messageId);
  return { action, emoji, userId, summary };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET REACTION SUMMARY
//    Returns { "👍": { count: 3, users: [userId, ...] }, ... }
// ─────────────────────────────────────────────────────────────────────────────
export const getReactionSummary = async (messageId) => {
  const rows = await MessageReaction.findAll({
    where:      { message_id: messageId },
    attributes: ['emoji', 'user_id'],
    order:      [['created_at', 'ASC']],
  });

  const summary = {};
  for (const row of rows) {
    if (!summary[row.emoji]) summary[row.emoji] = { count: 0, userIds: [] };
    summary[row.emoji].count++;
    summary[row.emoji].userIds.push(Number(row.user_id));
  }
  return summary;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET REACTORS — who reacted with a specific emoji on a message
// ─────────────────────────────────────────────────────────────────────────────
export const getReactors = async ({ messageId, emoji }) => {
  return await MessageReaction.findAll({
    where:   { message_id: messageId, ...(emoji ? { emoji } : {}) },
    include: [{
      model:      User,
      as:         'reactor',
      attributes: ['userId', 'userName'],
      include:    [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl'] }],
    }],
    order:   [['created_at', 'ASC']],
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. BULK LOAD REACTIONS for multiple messages (avoids N+1 in message lists)
// ─────────────────────────────────────────────────────────────────────────────
export const bulkLoadReactions = async (messageIds) => {
  if (!messageIds?.length) return {};

  const rows = await MessageReaction.findAll({
    where:      { message_id: messageIds },
    attributes: ['message_id', 'emoji', 'user_id'],
  });

  // Group by message_id
  const map = {};
  for (const row of rows) {
    const mid = String(row.message_id);
    if (!map[mid]) map[mid] = {};
    if (!map[mid][row.emoji]) map[mid][row.emoji] = { count: 0, userIds: [] };
    map[mid][row.emoji].count++;
    map[mid][row.emoji].userIds.push(Number(row.user_id));
  }
  return map;
};
