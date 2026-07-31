import {
  Op,
  col,
  fn,
  where as sequelizeWhere,
} from 'sequelize';
import sequelize from '../../config/db.js';
import Chat from './chat.model.js';
import ChatParticipant from '../chat_participant/chat_participant.model.js';
import Message from '../message/message.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import Community from '../community/community.model.js';
import Event from '../event/event.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import path from 'path';

const normalizeRecipientPhone = (value) => {
  const trimmed = String(value ?? '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    const error = new Error('phoneNumber must contain 7 to 15 digits');
    error.statusCode = 400;
    throw error;
  }
  return `${hasPlus ? '+' : ''}${digits}`;
};

export const resolveOneToOneTarget = async ({ targetUserId, phoneNumber }) => {
  if ((targetUserId == null) === (phoneNumber == null)) {
    const error = new Error('Provide exactly one of targetUserId or phoneNumber');
    error.statusCode = 400;
    throw error;
  }

  const activeUserWhere = {
    is_deleted: false,
    is_active: true,
    status: 'active',
  };
  let user;
  if (targetUserId != null) {
    user = await User.findOne({
      where: { ...activeUserWhere, userId: targetUserId },
      attributes: ['userId'],
    });
  } else {
    const normalized = normalizeRecipientPhone(phoneNumber);
    const digits = normalized.replace(/\D/g, '');
    const candidates = [...new Set([normalized, digits, `+${digits}`])];
    user = await User.findOne({
      where: { ...activeUserWhere, phone: { [Op.in]: candidates } },
      attributes: ['userId'],
    });

    if (!user) {
      const normalizedPhoneColumn = [' ', '-', '(', ')', '+'].reduce(
        (expression, character) =>
          fn('REPLACE', expression, character, ''),
        col('phone'),
      );
      user = await User.findOne({
        where: {
          ...activeUserWhere,
          [Op.and]: sequelizeWhere(normalizedPhoneColumn, digits),
        },
        attributes: ['userId'],
      });
    }
  }

  if (!user) {
    const error = new Error('The requested chat recipient is unavailable');
    error.statusCode = 404;
    throw error;
  }
  return user.userId;
};

// ─── Helper: derive display name & avatar for one_to_one chats ───────────────
const resolveOneToOneDetails = async (chatId, requestingUserId) => {
  const other = await ChatParticipant.findOne({
    where: { chat_id: chatId, user_id: { [Op.ne]: requestingUserId }, is_deleted: false },
    include: [
      {
        model: User, as: 'user',
        attributes: ['userId', 'userName', 'phone'],
        include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl', 'is_online', 'last_seen'] }],
      },
    ],
  });
  return other?.user ?? null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Get My Chats (Chat List Screen)
//    Returns all chats for a user — sorted by last_message_at DESC,
//    with last message preview, unread count, and online status.
// ─────────────────────────────────────────────────────────────────────────────
export const getMyChats = async (userId) => {
  // Fetch all participant rows for this user
  const participations = await ChatParticipant.findAll({
    where: { user_id: userId, is_deleted: false },
    include: [
      {
        model: Chat,
        as: 'chat',
        where: { is_deleted: false },
        include: [
          { model: User,            as: 'creator',   attributes: ['userId', 'userName'] },
          { model: Community,       as: 'community', attributes: ['communityId', 'communityName'] },
          { model: Event,           as: 'event',     attributes: ['id', 'title'] },
          { model: BusinessProfile, as: 'business',  attributes: ['id', 'business_name'] },
        ],
      },
    ],
    order: [[{ model: Chat, as: 'chat' }, 'last_message_at', 'DESC']],
  });

  // Hydrate each chat with last message + other-user details (for one_to_one)
  const result = await Promise.all(
    participations.map(async (p) => {
      const chat = p.chat.toJSON();

      // Last message preview
      let lastMessage = null;
      if (chat.last_message_id) {
        lastMessage = await Message.findOne({
          where: { id: chat.last_message_id },
          attributes: ['id', 'message', 'message_type', 'media_url', 'created_at', 'sender_id'],
          include: [{ model: User, as: 'sender', attributes: ['userId', 'userName'] }],
        });
      }

      // For one_to_one: resolve other participant's name, avatar, online status
      let otherUser = null;
      if (chat.chat_type === 'one_to_one') {
        otherUser = await resolveOneToOneDetails(chat.id, userId);
      }

      return {
        ...chat,
        unread_count:   p.unread_count,
        is_pinned_by_me: p.is_pinned,
        is_muted:       p.is_muted,
        muted_until:    p.muted_until,
        nickname:       p.nickname,
        last_message:   lastMessage,
        other_user:     otherUser,   // null for group chats
      };
    })
  );

  // Sort: pinned first, then by last_message_at
  return result.sort((a, b) => {
    if (a.is_pinned_by_me !== b.is_pinned_by_me) return b.is_pinned_by_me ? 1 : -1;
    return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Get or Create One-to-One Chat
//    Idempotent — returns existing chat if one already exists between two users.
// ─────────────────────────────────────────────────────────────────────────────
export const getOrCreateOneToOneChat = async ({ userId, targetUserId, created_by }) => {
  // Find an existing one_to_one chat that contains BOTH users
  const existingParticipation = await ChatParticipant.findOne({
    where: { user_id: userId, is_deleted: false },
    include: [
      {
        model: Chat, as: 'chat',
        where: { chat_type: 'one_to_one', is_deleted: false },
        required: true,
      },
    ],
  });

  if (existingParticipation) {
    // Verify the target user is also in that chat
    const chatIds = (await ChatParticipant.findAll({
      where: { user_id: userId, is_deleted: false },
      attributes: ['chat_id'],
    })).map((p) => p.chat_id);

    const targetParticipation = await ChatParticipant.findOne({
      where: { user_id: targetUserId, chat_id: chatIds, is_deleted: false },
      include: [{ model: Chat, as: 'chat', where: { chat_type: 'one_to_one', is_deleted: false } }],
    });

    if (targetParticipation) return { chat: targetParticipation.chat, created: false };
  }

  // Create new one_to_one chat inside a transaction
  return await sequelize.transaction(async (t) => {
    const chat = await Chat.create(
      { chat_type: 'one_to_one', created_by },
      { transaction: t }
    );
    await ChatParticipant.bulkCreate(
      [
        { chat_id: chat.id, user_id: userId,       role: 'member', created_by },
        { chat_id: chat.id, user_id: targetUserId, role: 'member', created_by },
      ],
      { transaction: t }
    );
    return { chat, created: true };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Create Group Chat
// ─────────────────────────────────────────────────────────────────────────────
export const createGroupChat = async ({ name, description, avatar_url, participantIds, created_by }) => {
  if (!name)                             throw new Error('Group name is required');
  if (!participantIds?.length)           throw new Error('At least one participant is required');

  return await sequelize.transaction(async (t) => {
    const chat = await Chat.create(
      { chat_type: 'group', name, description, avatar_url, created_by },
      { transaction: t }
    );

    const allIds = [...new Set([created_by, ...participantIds])];
    await ChatParticipant.bulkCreate(
      allIds.map((uid) => ({
        chat_id: chat.id,
        user_id: uid,
        role:    uid === created_by ? 'admin' : 'member',
        created_by,
      })),
      { transaction: t }
    );
    return chat;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Mute / Unmute Chat (per participant)
// ─────────────────────────────────────────────────────────────────────────────
export const muteChat = async ({ chatId, userId, is_muted, muted_until }) => {
  const participant = await ChatParticipant.findOne({
    where: { chat_id: chatId, user_id: userId, is_deleted: false },
  });
  if (!participant) throw new Error('You are not a participant of this chat');
  return await participant.update({ is_muted, muted_until: muted_until || null });
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. Pin / Unpin Chat (per participant)
// ─────────────────────────────────────────────────────────────────────────────
export const pinChat = async ({ chatId, userId, is_pinned }) => {
  const participant = await ChatParticipant.findOne({
    where: { chat_id: chatId, user_id: userId, is_deleted: false },
  });
  if (!participant) throw new Error('You are not a participant of this chat');
  return await participant.update({ is_pinned });
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. Upload Attachment (Multipart → local storage, returns url + metadata)
//    In production swap fs/path logic with Cloudinary / AWS S3 SDK calls.
// ─────────────────────────────────────────────────────────────────────────────
export const saveUploadedAttachment = (file) => {
  if (!file) throw new Error('No file uploaded');

  const ext      = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype;

  // Derive message_type from MIME
  const message_type = file.messageType || (
    mimeType.startsWith('image/') ? 'image'
      : mimeType.startsWith('video/') ? 'video'
        : mimeType.startsWith('audio/') ? 'audio'
          : 'document'
  );

  const media_url = `/uploads/${file.filename}`;

  const media_metadata = {
    file_name:     file.originalname,
    mime_type:     mimeType,
    size_bytes:    file.size,
    extension:     ext,
    sha256:        file.sha256,
    stored_name:   file.filename,
    // Legacy aliases remain during the mobile-client transition.
    original_name: file.originalname,
    file_size:     file.size,
    // duration / dimensions are available only after server-side processing
    // (e.g., ffprobe for video/audio, sharp for images)
  };

  return { media_url, media_metadata, message_type };
};

// ─────────────────────────────────────────────────────────────────────────────
// Legacy CRUD (kept for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────
export const createChat = async (chatData) => Chat.create(chatData);

export const getAllChats = async () =>
  Chat.findAll({
    where: { is_deleted: false },
    include: [
      { model: User,            as: 'creator',   attributes: ['userId', 'userName', 'profile_image'] },
      { model: Community,       as: 'community', attributes: ['communityId', 'communityName'] },
      { model: Event,           as: 'event',     attributes: ['id', 'title'] },
      { model: BusinessProfile, as: 'business',  attributes: ['id', 'business_name'] },
    ],
  });

export const getChatById = async (id) =>
  Chat.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User,            as: 'creator',   attributes: ['userId', 'userName', 'profile_image'] },
      { model: Community,       as: 'community', attributes: ['communityId', 'communityName'] },
      { model: Event,           as: 'event',     attributes: ['id', 'title'] },
      { model: BusinessProfile, as: 'business',  attributes: ['id', 'business_name'] },
    ],
  });

export const updateChat = async (id, updateData) => {
  const chat = await Chat.findOne({ where: { id, is_deleted: false } });
  if (!chat) return null;
  return await chat.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteChat = async (id, deletedRemarks, updated_by) => {
  const chat = await Chat.findOne({ where: { id, is_deleted: false } });
  if (!chat) return null;
  return await chat.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteChats = async (ids, deletedRemarks, updated_by) =>
  Chat.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
