import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import ChatParticipant from './chat_participant.model.js';
import Chat from '../chat/chat.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';

// ─── Shared includes for participant queries ─────────────────────────────────
const PARTICIPANT_INCLUDES = [
  {
    model: User, as: 'user',
    attributes: ['userId', 'userName'],
    include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl', 'is_online', 'last_seen'] }],
  },
  { model: Chat, as: 'chat', attributes: ['id', 'chat_type', 'name'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET CHAT MEMBERS (with online status for UI header)
// ─────────────────────────────────────────────────────────────────────────────
export const getChatMembers = async (chatId) => {
  return await ChatParticipant.findAll({
    where:   { chat_id: chatId, is_deleted: false },
    include: PARTICIPANT_INCLUDES,
    order:   [['role', 'ASC']], // admins first
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. ADD PARTICIPANTS (bulk, inside transaction)
//    Only chat admins should call this (authorization checked in controller).
// ─────────────────────────────────────────────────────────────────────────────
export const addParticipants = async ({ chatId, userIds, addedBy }) => {
  const chat = await Chat.findOne({ where: { id: chatId, is_deleted: false } });
  if (!chat) throw new Error('Chat not found');
  if (chat.chat_type === 'one_to_one') throw new Error('Cannot add participants to a one-to-one chat');

  return await sequelize.transaction(async (t) => {
    const existing = await ChatParticipant.findAll({
      where: { chat_id: chatId, user_id: userIds, is_deleted: false },
      attributes: ['user_id'],
    });
    const existingIds = existing.map((p) => Number(p.user_id));
    const newIds      = userIds.filter((id) => !existingIds.includes(Number(id)));

    if (!newIds.length) throw new Error('All users are already participants');

    return await ChatParticipant.bulkCreate(
      newIds.map((uid) => ({
        chat_id: chatId,
        user_id: uid,
        role:    'member',
        created_by: addedBy,
      })),
      { transaction: t }
    );
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. REMOVE MEMBER
//    Soft-deletes the participant record.
// ─────────────────────────────────────────────────────────────────────────────
export const removeMember = async ({ chatId, userId, removedBy }) => {
  const participant = await ChatParticipant.findOne({
    where: { chat_id: chatId, user_id: userId, is_deleted: false },
  });
  if (!participant) throw new Error('Participant not found in this chat');
  return await participant.update({
    is_deleted:     true,
    deletedRemarks: 'Removed from chat',
    updated_by:     removedBy,
    updatedAt:      new Date(),
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. MAKE ADMIN
// ─────────────────────────────────────────────────────────────────────────────
export const makeAdmin = async ({ chatId, userId, promotedBy }) => {
  const participant = await ChatParticipant.findOne({
    where: { chat_id: chatId, user_id: userId, is_deleted: false },
  });
  if (!participant) throw new Error('Participant not found in this chat');
  return await participant.update({ role: 'admin', updated_by: promotedBy, updatedAt: new Date() });
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. LEAVE CHAT
//    User removes themselves. If they were the only admin, promote next member.
// ─────────────────────────────────────────────────────────────────────────────
export const leaveChat = async ({ chatId, userId }) => {
  const participant = await ChatParticipant.findOne({
    where: { chat_id: chatId, user_id: userId, is_deleted: false },
  });
  if (!participant) throw new Error('You are not a participant of this chat');

  await sequelize.transaction(async (t) => {
    await participant.update(
      { is_deleted: true, deletedRemarks: 'Left chat', updated_by: userId, updatedAt: new Date() },
      { transaction: t }
    );

    // If leaving admin was the only admin, auto-promote oldest remaining member
    if (participant.role === 'admin') {
      const adminCount = await ChatParticipant.count({
        where: { chat_id: chatId, role: 'admin', is_deleted: false },
      });
      if (adminCount === 0) {
        const nextMember = await ChatParticipant.findOne({
          where:  { chat_id: chatId, is_deleted: false },
          order:  [['joined_at', 'ASC']],
        });
        if (nextMember) {
          await nextMember.update({ role: 'admin' }, { transaction: t });
        }
      }
    }
  });

  return { success: true };
};

// ─────────────────────────────────────────────────────────────────────────────
// Legacy CRUD (kept for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────
export const createParticipant = async (data) => ChatParticipant.create(data);

export const getAllParticipants = async () =>
  ChatParticipant.findAll({
    where:   { is_deleted: false },
    include: PARTICIPANT_INCLUDES,
  });

export const getParticipantById = async (id) =>
  ChatParticipant.findOne({
    where:   { id, is_deleted: false },
    include: PARTICIPANT_INCLUDES,
  });

export const updateParticipant = async (id, updateData) => {
  const participant = await ChatParticipant.findOne({ where: { id, is_deleted: false } });
  if (!participant) return null;
  return await participant.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteParticipant = async (id, deletedRemarks, updated_by) => {
  const participant = await ChatParticipant.findOne({ where: { id, is_deleted: false } });
  if (!participant) return null;
  return await participant.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteParticipants = async (ids, deletedRemarks, updated_by) =>
  ChatParticipant.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
