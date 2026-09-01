import Chat from '../chat/chat.model.js';
import ChatParticipant from '../chat_participant/chat_participant.model.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import sequelize from '../../config/db.js';
import { revokeUserFromChatRoom } from '../../socket.js';

const participantRole = (role) => role === 'admin' || role === 'moderator' ? 'admin' : 'member';

const setSentinel = async (sql, replacements, transaction) => {
  try {
    await sequelize.query(sql, { replacements, transaction });
    return true;
  } catch (error) {
    if (error.original?.code === 'ER_BAD_FIELD_ERROR') return false;
    throw error;
  }
};

export const getOrCreateCommunityChat = async (community, transaction) => {
  const commId = community.communityId || community.id;
  const commName = community.communityName || community.name || 'Community Chat';
  const commDesc = community.communityDescription || community.description || '';
  const commCover = community.cover_image || community.coverImage || null;
  const commCreator = community.created_by || community.createdBy || 1;

  let chat = await Chat.findOne({
    where: { community_id: commId, chat_type: 'community', is_deleted: false },
    transaction,
    lock: transaction?.LOCK?.UPDATE,
  });
  if (!chat) {
    try {
      chat = await Chat.create({
        chat_type: 'community',
        community_id: commId,
        name: commName,
        description: commDesc,
        avatar_url: commCover,
        created_by: commCreator,
        is_active: true,
        is_deleted: false,
      }, { transaction });
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
      chat = await Chat.findOne({
        where: { community_id: commId, chat_type: 'community', is_deleted: false },
        transaction,
      });
      if (!chat) throw error;
    }
  }
  if (chat?.id) {
    try {
      await setSentinel(
        'UPDATE chats SET community_chat_key = 1 WHERE id = ?',
        [chat.id],
        transaction,
      );
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error;
      await chat.update({ is_deleted: true, is_active: false }, { transaction });
      const [rows] = await sequelize.query(
        'SELECT id FROM chats WHERE community_id = ? AND community_chat_key = 1 LIMIT 1',
        { replacements: [commId], transaction },
      );
      chat = rows[0] ? await Chat.findByPk(rows[0].id, { transaction }) : null;
      if (!chat) throw error;
    }
  }
  return chat;
};

export const syncCommunityChatParticipant = async (
  community,
  userId,
  membership,
  transaction,
) => {
  const commId = community.communityId || community.id;
  const commCreator = community.created_by || community.createdBy || userId;
  const chat = await getOrCreateCommunityChat(community, transaction);
  const active = membership ? (membership.status === 'active' && !membership.is_deleted) : true;
  const [participant] = await ChatParticipant.findOrCreate({
    where: { chat_id: chat.id, user_id: userId },
    defaults: {
      role: participantRole(membership?.role),
      created_by: commCreator,
      is_active: active,
      is_deleted: !active,
      joined_at: new Date(),
    },
    transaction,
  });
  if (participant && typeof participant.update === 'function') {
    await participant.update({
      role: participantRole(membership?.role),
      is_active: active,
      is_deleted: !active,
      updatedAt: new Date(),
    }, { transaction });
  }
  if (participant?.id) {
    await setSentinel(
      'UPDATE chat_participants SET membership_key = ? WHERE id = ?',
      [active ? 1 : null, participant.id],
      transaction,
    );
  }
  if (!active && chat?.id) {
    await revokeUserFromChatRoom(chat.id, userId).catch(() => {});
  }
  return chat;
};

export const syncAllCommunityChatParticipants = async (community, transaction) => {
  const commId = community.communityId || community.id;
  const memberships = await CommunityMember.findAll({
    where: { community_id: commId, status: 'active', is_deleted: false },
    transaction,
  });
  const chat = await getOrCreateCommunityChat(community, transaction);
  for (const membership of memberships) {
    await syncCommunityChatParticipant(community, membership.user_id, membership, transaction);
  }
  return chat;
};
