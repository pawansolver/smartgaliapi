import sequelize from '../../config/db.js';
import SocietyFacility from './society_facility.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import {
  getCachedFacilities,
  setCachedFacilities,
  invalidateFacilitiesCache,
} from '../society_profile/society.cache.js';

export const createFacility = async (societyId, userId, facilityData, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const facility = await SocietyFacility.create({
      society_id: societyId,
      name: facilityData.name,
      description: facilityData.description || null,
      operating_hours: facilityData.operating_hours || null,
      booking_rules: facilityData.booking_rules || null,
      max_capacity: facilityData.max_capacity || null,
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.facility_created',
      targetEntityType: 'facility',
      targetEntityId: facility.id,
      newValue: { name: facility.name },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    await invalidateFacilitiesCache(societyId);

    return facility;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getAllFacilities = async (societyId, query = {}) => {
  if (!query.search && query.is_active === undefined) {
    const cached = await getCachedFacilities(societyId);
    if (cached) return cached;
  }

  const where = { society_id: societyId, is_deleted: false };
  if (query.is_active !== undefined) {
    where.is_active = Boolean(query.is_active);
  }

  const facilities = await SocietyFacility.findAll({
    where,
    order: [['name', 'ASC'], ['id', 'ASC']],
  });

  if (!query.search && query.is_active === undefined) {
    await setCachedFacilities(societyId, facilities);
  }

  return facilities;
};

export const getFacilityById = async (id, societyId) => {
  return await SocietyFacility.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
};

export const updateFacility = async (id, societyId, updateData, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const facility = await SocietyFacility.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!facility) {
      await transaction.commit();
      return null;
    }

    const oldValue = facility.toJSON();
    await facility.update({
      ...updateData,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.facility_updated',
      targetEntityType: 'facility',
      targetEntityId: id,
      oldValue,
      newValue: facility.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    await invalidateFacilitiesCache(societyId);

    return facility;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const softDeleteFacility = async (id, societyId, deletedRemarks, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const facility = await SocietyFacility.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!facility) {
      await transaction.commit();
      return null;
    }

    await facility.update({
      is_deleted: true,
      deletedRemarks,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.facility_deleted',
      targetEntityType: 'facility',
      targetEntityId: id,
      reason: deletedRemarks,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    await invalidateFacilitiesCache(societyId);

    return facility;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
