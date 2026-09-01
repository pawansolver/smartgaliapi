import { Op } from 'sequelize';
import CommunityMedia from './community_media.model.js';
import Post from '../post/post.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import sequelize from '../../config/db.js';
import { logCommunityAudit } from '../community/community_audit_log.service.js';

export const uploadMedia = async (communityId, userId, { mediaUrl, mediaType = 'image', caption = '' }) => {
  if (!mediaUrl) throw new Error('Media URL is required');

  const transaction = await sequelize.transaction();
  try {
    const media = await CommunityMedia.create({
      community_id: communityId,
      media_url: mediaUrl,
      media_type: mediaType,
      caption: caption ? caption.trim() : null,
      uploaded_by: userId,
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId: userId,
      action: 'media.uploaded',
      targetEntityType: 'media',
      targetEntityId: media.id,
      newValue: { mediaType, mediaUrl },
    }, { transaction });

    await transaction.commit();
    return media;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getCommunityGallery = async (communityId) => {
  const directMedia = await CommunityMedia.findAll({
    where: { community_id: communityId, is_active: true, is_deleted: false },
    include: [{ model: User, as: 'uploader', attributes: ['userId', 'userName'] }],
    order: [['created_at', 'DESC']],
  });

  const postsWithMedia = await Post.findAll({
    where: {
      community_id: communityId,
      is_active: true,
      is_deleted: false,
      media_url: { [Op.ne]: null },
    },
    include: [
      {
        model: User,
        as: 'author',
        attributes: ['userId', 'userName'],
        include: [{ model: UserProfile, as: 'profile', attributes: ['fullName', 'avatarUrl'], required: false }],
      },
    ],
    order: [['created_at', 'DESC']],
    limit: 60,
  });

  const formattedPostMedia = postsWithMedia.map((p) => ({
    id: p.id,
    community_id: communityId,
    media_url: p.media_url,
    media_type: p.type === 'video' ? 'video' : 'image',
    caption: p.content,
    uploaded_by: p.user_id,
    is_active: true,
    created_at: p.created_at,
    uploader: p.author,
    source: 'post',
  }));

  const directList = directMedia.map((m) => ({ ...m.toJSON(), source: 'gallery' }));
  const combined = [...directList, ...formattedPostMedia];
  combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Deduplicate by media_url
  const seen = new Set();
  return combined.filter((item) => {
    if (!item.media_url || seen.has(item.media_url)) return false;
    seen.add(item.media_url);
    return true;
  });
};

export const deleteMedia = async (communityId, mediaId, userId) => {
  const transaction = await sequelize.transaction();
  try {
    const directMedia = await CommunityMedia.findOne({
      where: { id: mediaId, community_id: communityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (directMedia) {
      await directMedia.update({ is_deleted: true, updated_by: userId, updatedAt: new Date() }, { transaction });
      await logCommunityAudit({
        communityId,
        actorUserId: userId,
        action: 'media.deleted',
        targetEntityType: 'media',
        targetEntityId: mediaId,
      }, { transaction });
      await transaction.commit();
      return true;
    }

    const post = await Post.findOne({
      where: { id: mediaId, community_id: communityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (post) {
      await post.update({ is_deleted: true, updated_by: userId, updatedAt: new Date() }, { transaction });
      await logCommunityAudit({
        communityId,
        actorUserId: userId,
        action: 'media.deleted',
        targetEntityType: 'post_media',
        targetEntityId: mediaId,
      }, { transaction });
      await transaction.commit();
      return true;
    }

    await transaction.commit();
    return null;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const syncPostMediaToGallery = async (communityId, userId, mediaUrl, mediaType = 'image') => {
  if (!mediaUrl || !communityId) return null;
  try {
    const existing = await CommunityMedia.findOne({
      where: { community_id: communityId, media_url: mediaUrl, is_deleted: false },
    });
    if (existing) return existing;

    return await CommunityMedia.create({
      community_id: communityId,
      media_url: mediaUrl,
      media_type: mediaType,
      caption: null,
      uploaded_by: userId,
      created_by: userId,
      created_at: new Date(),
    });
  } catch {
    return null;
  }
};
