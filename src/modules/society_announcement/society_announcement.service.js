import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyAnnouncement from './society_announcement.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import {
  getCachedAnnouncements,
  setCachedAnnouncements,
  invalidateAnnouncementsCache,
} from '../society_profile/society.cache.js';

export const createAnnouncement = async (societyId, userId, announcementData, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const announcement = await SocietyAnnouncement.create({
      society_id: societyId,
      created_by: userId,
      title: announcementData.title,
      message: announcementData.message || announcementData.content,
      priority: announcementData.priority || 'medium',
      category: announcementData.category || 'general',
      is_pinned: Boolean(announcementData.is_pinned),
      expires_at: announcementData.expires_at || null,
      created_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.announcement_created',
      targetEntityType: 'announcement',
      targetEntityId: announcement.id,
      newValue: { title: announcement.title, priority: announcement.priority },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.announcement_created',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        announcementId: Number(announcement.id),
        title: announcement.title,
        message: announcement.message,
        priority: announcement.priority,
        createdBy: Number(userId),
      },
    }, { transaction });

    await transaction.commit();
    await invalidateAnnouncementsCache(societyId);

    return announcement;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getAllAnnouncements = async (societyId, query = {}) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;

  // Use cache for standard default query on page 1
  if (page === 1 && !query.priority && !query.category && !query.search && !query.include_expired) {
    const cached = await getCachedAnnouncements(societyId);
    if (cached) return cached;
  }

  const where = { society_id: societyId, is_deleted: false };
  if (query.priority) where.priority = query.priority;
  if (query.category) where.category = query.category;
  if (query.is_pinned !== undefined) where.is_pinned = query.is_pinned;

  if (!query.include_expired) {
    where[Op.or] = [
      { expires_at: null },
      { expires_at: { [Op.gt]: new Date() } },
    ];
  }

  if (query.search) {
    where[Op.and] = [
      {
        [Op.or]: [
          { title: { [Op.like]: `%${query.search.trim()}%` } },
          { message: { [Op.like]: `%${query.search.trim()}%` } },
        ]
      }
    ];
  }

  const { rows, count } = await SocietyAnnouncement.findAndCountAll({
    where,
    limit,
    offset,
    order: [
      ['is_pinned', 'DESC'],
      ['created_at', 'DESC'],
      ['id', 'DESC'],
    ],
    include: [
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });

  const response = {
    data: rows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };

  if (page === 1 && !query.priority && !query.category && !query.search && !query.include_expired) {
    await setCachedAnnouncements(societyId, response);
  }

  return response;
};

export const getAnnouncementById = async (id, societyId) => {
  return await SocietyAnnouncement.findOne({
    where: { id, society_id: societyId, is_deleted: false },
    include: [
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const updateAnnouncement = async (id, societyId, updateData, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const announcement = await SocietyAnnouncement.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!announcement) {
      await transaction.commit();
      return null;
    }

    const oldValue = announcement.toJSON();
    await announcement.update({
      ...updateData,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.announcement_updated',
      targetEntityType: 'announcement',
      targetEntityId: id,
      oldValue,
      newValue: announcement.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    await invalidateAnnouncementsCache(societyId);

    return announcement;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const softDeleteAnnouncement = async (id, societyId, deletedRemarks, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const announcement = await SocietyAnnouncement.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!announcement) {
      await transaction.commit();
      return null;
    }

    await announcement.update({
      is_deleted: true,
      deletedRemarks,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.announcement_deleted',
      targetEntityType: 'announcement',
      targetEntityId: id,
      reason: deletedRemarks,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    await invalidateAnnouncementsCache(societyId);

    return announcement;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
