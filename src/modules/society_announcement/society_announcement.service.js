import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyAnnouncement, {
  ANNOUNCEMENT_PRIORITY,
  ANNOUNCEMENT_STATUS,
  ANNOUNCEMENT_AUDIENCE,
} from './society_announcement.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import {
  getCachedAnnouncements,
  setCachedAnnouncements,
  invalidateAnnouncementsCache,
} from '../society_profile/society.cache.js';

/**
 * Generate unique sequential announcement number, e.g. ANN-2026-00019
 */
export const generateAnnouncementNumber = async (transaction) => {
  const year = new Date().getFullYear();
  const [rows] = await sequelize.query(
    `SELECT announcement_number FROM society_announcements WHERE announcement_number LIKE 'ANN-${year}-%' ORDER BY id DESC LIMIT 50`,
    transaction ? { transaction } : {}
  );
  let maxSeq = 0;
  for (const row of rows) {
    const parts = (row.announcement_number || '').split('-');
    const seq = parseInt(parts[2], 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }
  const [idRes] = await sequelize.query(
    'SELECT MAX(id) as maxId FROM society_announcements',
    transaction ? { transaction } : {}
  );
  const maxId = Number(idRes[0]?.maxId || 0);
  let nextSeq = Math.max(maxSeq, maxId) + 1;
  let candidate = `ANN-${year}-${String(nextSeq).padStart(5, '0')}`;

  let exists = true;
  while (exists) {
    const [chk] = await sequelize.query(
      `SELECT id FROM society_announcements WHERE announcement_number = '${candidate}' LIMIT 1`,
      transaction ? { transaction } : {}
    );
    if (chk && chk.length > 0) {
      nextSeq++;
      candidate = `ANN-${year}-${String(nextSeq).padStart(5, '0')}`;
    } else {
      exists = false;
    }
  }

  return candidate;
};

export const createAnnouncement = async (societyId, userId, announcementData, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const announcementNumber = await generateAnnouncementNumber(transaction);
    const now = new Date();

    const isDraft = announcementData.status === ANNOUNCEMENT_STATUS.DRAFT;
    const publishAt = announcementData.publish_at ? new Date(announcementData.publish_at) : null;
    const isScheduled = publishAt && publishAt > now;

    let status = announcementData.status || ANNOUNCEMENT_STATUS.PUBLISHED;
    let publishedAt = null;

    if (!isDraft) {
      if (isScheduled) {
        status = ANNOUNCEMENT_STATUS.PUBLISHED;
        publishedAt = publishAt;
      } else {
        status = ANNOUNCEMENT_STATUS.PUBLISHED;
        publishedAt = now;
      }
    }

    const messageText = announcementData.message || announcementData.content || '';
    const summaryText = announcementData.summary || (messageText ? messageText.slice(0, 150) : null);

    const announcement = await SocietyAnnouncement.create({
      announcement_number: announcementNumber,
      society_id: societyId,
      created_by: userId,
      title: announcementData.title,
      summary: summaryText,
      message: messageText,
      action_text: announcementData.action_text || null,
      audience: announcementData.audience || ANNOUNCEMENT_AUDIENCE.ENTIRE_SOCIETY,
      priority: announcementData.priority || ANNOUNCEMENT_PRIORITY.MEDIUM,
      category: announcementData.category || 'general',
      is_pinned: Boolean(announcementData.is_pinned),
      publish_at: publishAt || (isDraft ? null : now),
      published_at: publishedAt,
      status,
      attachments: Array.isArray(announcementData.attachments) ? announcementData.attachments : [],
      expires_at: announcementData.expires_at ? new Date(announcementData.expires_at) : null,
      created_at: now,
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: isDraft ? 'society.announcement_draft_created' : 'society.announcement_created',
      targetEntityType: 'announcement',
      targetEntityId: announcement.id,
      newValue: {
        announcement_number: announcement.announcement_number,
        title: announcement.title,
        priority: announcement.priority,
        status: announcement.status,
      },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    // Only dispatch notification outbox event when published immediately (not draft and not scheduled for future)
    const shouldDispatchNotification = !isDraft && (!publishAt || publishAt <= now);
    if (shouldDispatchNotification) {
      await createEvent({
        event_type: 'society.announcement_created',
        aggregate_type: 'announcement',
        aggregate_id: announcement.id,
        payload: {
          societyId: Number(societyId),
          announcementId: Number(announcement.id),
          announcementNumber: announcement.announcement_number,
          title: announcement.title,
          summary: announcement.summary,
          message: announcement.message,
          priority: announcement.priority,
          category: announcement.category,
          createdBy: Number(userId),
        },
      }, { transaction });
    }

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

  // Use cache only for default active feed query
  const isDefaultFeed = page === 1 &&
    !query.priority &&
    !query.category &&
    !query.search &&
    !query.status &&
    !query.audience &&
    !query.include_expired;

  if (isDefaultFeed) {
    const cached = await getCachedAnnouncements(societyId);
    if (cached) return cached;
  }

  const where = { society_id: societyId, is_deleted: false };

  // Status handling:
  // - If query.status === 'all', show all statuses (for admins)
  // - If query.status is specified ('draft', 'published', 'archived'), filter by it
  // - Default: only show 'published'
  if (query.status && query.status !== 'all') {
    where.status = query.status;
  } else if (!query.status) {
    where.status = ANNOUNCEMENT_STATUS.PUBLISHED;
  }

  // Publication time filtering:
  // If viewing published feed, notices must have published_at <= NOW()
  if (where.status === ANNOUNCEMENT_STATUS.PUBLISHED && query.status !== 'all') {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
      [Op.or]: [
        { published_at: null },
        { published_at: { [Op.lte]: new Date() } },
      ]
    });
  }

  if (query.priority) where.priority = query.priority;
  if (query.category) where.category = query.category;
  if (query.audience) where.audience = query.audience;
  if (query.is_pinned !== undefined) where.is_pinned = query.is_pinned;

  // Expiry filtering: exclude expired notices unless explicitly requested
  if (!query.include_expired) {
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
      [Op.or]: [
        { expires_at: null },
        { expires_at: { [Op.gt]: new Date() } },
      ]
    });
  }

  // Multi-field search
  if (query.search) {
    const term = `%${query.search.trim()}%`;
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
      [Op.or]: [
        { title: { [Op.like]: term } },
        { announcement_number: { [Op.like]: term } },
        { summary: { [Op.like]: term } },
        { message: { [Op.like]: term } },
      ]
    });
  }

  const { rows, count } = await SocietyAnnouncement.findAndCountAll({
    where,
    limit,
    offset,
    order: [
      ['is_pinned', 'DESC'],
      ['published_at', 'DESC'],
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

  if (isDefaultFeed) {
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
    const fieldsToUpdate = { ...updateData };

    if (updateData.content && !updateData.message) {
      fieldsToUpdate.message = updateData.content;
    }

    const now = new Date();
    let isTransitioningToPublished = false;

    // If previously a draft or scheduled, and now being published
    if (
      updateData.status === ANNOUNCEMENT_STATUS.PUBLISHED &&
      oldValue.status !== ANNOUNCEMENT_STATUS.PUBLISHED
    ) {
      fieldsToUpdate.published_at = fieldsToUpdate.publish_at && new Date(fieldsToUpdate.publish_at) > now
        ? new Date(fieldsToUpdate.publish_at)
        : now;
      isTransitioningToPublished = true;
    }

    // Auto-update summary if message changed without explicit summary
    if (fieldsToUpdate.message && !fieldsToUpdate.summary) {
      fieldsToUpdate.summary = fieldsToUpdate.message.slice(0, 150);
    }

    fieldsToUpdate.updated_by = actorUserId;
    fieldsToUpdate.updatedAt = now;

    await announcement.update(fieldsToUpdate, { transaction });

    // Determine audit action
    let auditAction = 'society.announcement_updated';
    if (isTransitioningToPublished) {
      auditAction = 'society.announcement_published';
    } else if (updateData.is_pinned !== undefined && updateData.is_pinned !== oldValue.is_pinned) {
      auditAction = updateData.is_pinned ? 'society.announcement_pinned' : 'society.announcement_unpinned';
    } else if (updateData.status === ANNOUNCEMENT_STATUS.ARCHIVED) {
      auditAction = 'society.announcement_archived';
    }

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: auditAction,
      targetEntityType: 'announcement',
      targetEntityId: id,
      oldValue,
      newValue: announcement.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    // If newly transitioning to published, dispatch outbox event
    if (isTransitioningToPublished) {
      await createEvent({
        event_type: 'society.announcement_created',
        aggregate_type: 'announcement',
        aggregate_id: announcement.id,
        payload: {
          societyId: Number(societyId),
          announcementId: Number(announcement.id),
          announcementNumber: announcement.announcement_number,
          title: announcement.title,
          summary: announcement.summary,
          message: announcement.message,
          priority: announcement.priority,
          category: announcement.category,
          createdBy: Number(announcement.created_by || actorUserId),
        },
      }, { transaction });
    }

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
      status: ANNOUNCEMENT_STATUS.ARCHIVED,
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

export const bulkDeleteAnnouncements = async (ids, societyId, deletedRemarks, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const announcements = await SocietyAnnouncement.findAll({
      where: {
        id: { [Op.in]: ids },
        society_id: societyId,
        is_deleted: false,
      },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!announcements.length) {
      await transaction.commit();
      return { count: 0, deletedIds: [] };
    }

    const deletedIds = announcements.map((a) => a.id);
    const now = new Date();

    await SocietyAnnouncement.update({
      is_deleted: true,
      status: ANNOUNCEMENT_STATUS.ARCHIVED,
      deletedRemarks: deletedRemarks || 'Bulk deleted by admin',
      updated_by: actorUserId,
      updatedAt: now,
    }, {
      where: {
        id: { [Op.in]: deletedIds },
        society_id: societyId,
      },
      transaction,
    });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.announcement_bulk_deleted',
      targetEntityType: 'announcement',
      targetEntityId: null,
      reason: deletedRemarks || 'Bulk deleted by admin',
      newValue: { count: deletedIds.length, deletedIds },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    await invalidateAnnouncementsCache(societyId);

    return { count: deletedIds.length, deletedIds };
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

