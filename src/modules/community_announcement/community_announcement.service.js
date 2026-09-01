import CommunityAnnouncement from './community_announcement.model.js';
import User from '../user/user.model.js';
import sequelize from '../../config/db.js';
import { createEvent } from '../outbox/outbox.service.js';
import { OUTBOX_EVENT_TYPES, OUTBOX_AGGREGATE_TYPES } from '../outbox/outbox.events.js';
import { logCommunityAudit } from '../community/community_audit_log.service.js';

export const createAnnouncement = async (communityId, userId, { title, message, isPinned = true }) => {
  if (!title || !title.trim()) throw new Error('Announcement title is required');
  if (!message || !message.trim()) throw new Error('Announcement message is required');

  const transaction = await sequelize.transaction();
  try {
    const announcement = await CommunityAnnouncement.create({
      community_id: communityId,
      title: title.trim(),
      message: message.trim(),
      is_pinned: Boolean(isPinned),
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    await createEvent({
      event_type: OUTBOX_EVENT_TYPES.COMMUNITY_ANNOUNCEMENT || 'community.announcement_created',
      aggregate_type: OUTBOX_AGGREGATE_TYPES.COMMUNITY || 'community',
      aggregate_id: String(announcement.id),
      payload: {
        communityId: Number(communityId),
        announcementId: Number(announcement.id),
        userId: Number(userId),
        title: announcement.title,
        message: announcement.message,
      },
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId: userId,
      action: 'announcement.created',
      targetEntityType: 'announcement',
      targetEntityId: announcement.id,
      newValue: { title: announcement.title, isPinned: announcement.is_pinned },
    }, { transaction });

    await transaction.commit();
    return announcement;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getCommunityAnnouncements = async (communityId) => {
  return await CommunityAnnouncement.findAll({
    where: { community_id: communityId, is_active: true, is_deleted: false },
    include: [{ model: User, as: 'author', attributes: ['userId', 'userName'] }],
    order: [['is_pinned', 'DESC'], ['created_at', 'DESC']],
  });
};

export const deleteAnnouncement = async (communityId, announcementId, userId) => {
  const transaction = await sequelize.transaction();
  try {
    const announcement = await CommunityAnnouncement.findOne({
      where: { id: announcementId, community_id: communityId, is_deleted: false },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!announcement) {
      await transaction.commit();
      return null;
    }

    await announcement.update({
      is_deleted: true,
      updated_by: userId,
      updatedAt: new Date(),
    }, { transaction });

    await logCommunityAudit({
      communityId,
      actorUserId: userId,
      action: 'announcement.deleted',
      targetEntityType: 'announcement',
      targetEntityId: announcementId,
    }, { transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
