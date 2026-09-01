import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from './society_profile.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from './society_audit_log.service.js';
import {
  getCachedSocietyDetail,
  setCachedSocietyDetail,
  invalidateSocietyDetailCache,
} from './society.cache.js';

export const createProfile = async (userId, profileData, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const profile = await SocietyProfile.create({
      user_id: userId,
      society_name: profileData.society_name,
      registration_no: profileData.registration_no || null,
      address: profileData.address || null,
      latitude: profileData.latitude ? Number(profileData.latitude) : null,
      longitude: profileData.longitude ? Number(profileData.longitude) : null,
      total_flats: profileData.total_flats ? Number(profileData.total_flats) : null,
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    // Creator is automatically registered as Active Admin
    await SocietyMember.create({
      society_id: profile.id,
      user_id: userId,
      role: 'admin',
      status: 'active',
      joined_at: new Date(),
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId: profile.id,
      actorUserId: userId,
      action: 'society.created',
      newValue: { society_name: profile.society_name },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.created',
      aggregate_type: 'society',
      aggregate_id: String(profile.id),
      payload: {
        societyId: Number(profile.id),
        societyName: profile.society_name,
        createdBy: Number(userId),
      },
    }, { transaction });

    await transaction.commit();
    await invalidateSocietyDetailCache(profile.id);

    return await getProfileById(profile.id);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getAllProfiles = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = { is_deleted: false };
  if (query.search) {
    where.society_name = { [Op.like]: `%${query.search.trim()}%` };
  }

  const { rows, count } = await SocietyProfile.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    include: [
      { model: User, as: 'admin_user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });

  return {
    data: rows,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
  };
};

export const getProfileById = async (id) => {
  const cached = await getCachedSocietyDetail(id);
  if (cached) return cached;

  const profile = await SocietyProfile.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'admin_user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });

  if (profile) {
    await setCachedSocietyDetail(id, profile.toJSON());
  }
  return profile;
};

export const updateProfile = async (id, updateData, userId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const profile = await SocietyProfile.findOne({
      where: { id, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!profile) {
      await transaction.commit();
      return null;
    }

    const oldValue = profile.toJSON();
    await profile.update({
      ...updateData,
      updated_by: userId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId: id,
      actorUserId: userId,
      action: 'society.updated',
      oldValue,
      newValue: profile.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.updated',
      aggregate_type: 'society',
      aggregate_id: String(id),
      payload: {
        societyId: Number(id),
        societyName: profile.society_name,
        updatedBy: Number(userId),
      },
    }, { transaction });

    await transaction.commit();
    await invalidateSocietyDetailCache(id);

    return profile;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const softDeleteProfile = async (id, deletedRemarks, updated_by, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const profile = await SocietyProfile.findOne({
      where: { id, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!profile) {
      await transaction.commit();
      return null;
    }

    await profile.update({
      is_deleted: true,
      deletedRemarks,
      updated_by,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId: id,
      actorUserId: updated_by,
      action: 'society.deleted',
      reason: deletedRemarks,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    await invalidateSocietyDetailCache(id);

    return profile;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const bulkSoftDeleteProfiles = async (ids, deletedRemarks, updated_by) => {
  const result = await SocietyProfile.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
  for (const id of ids) {
    await invalidateSocietyDetailCache(id);
  }
  return result;
};
