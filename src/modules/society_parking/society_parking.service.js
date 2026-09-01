import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyParking from './society_parking.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';

export const createParking = async (societyId, userId, data, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    // Duplicate active slot allocation check with lock
    const existing = await SocietyParking.findOne({
      where: {
        society_id: societyId,
        parking_slot_no: data.parking_slot_no,
        status: 'active',
        is_deleted: false,
      },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (existing) {
      const err = new Error(`Parking slot '${data.parking_slot_no}' is already actively allocated`);
      err.statusCode = 409;
      throw err;
    }

    const parking = await SocietyParking.create({
      society_id: societyId,
      user_id: data.user_id || null,
      parking_slot_no: data.parking_slot_no,
      vehicle_type: data.vehicle_type,
      vehicle_no: data.vehicle_no,
      vehicle_model: data.vehicle_model || null,
      is_visitor_parking: Boolean(data.is_visitor_parking),
      status: data.status || 'active',
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.parking_allocated',
      targetUserId: data.user_id,
      targetEntityType: 'parking',
      targetEntityId: parking.parkingId,
      newValue: { parking_slot_no: parking.parking_slot_no, vehicle_no: parking.vehicle_no },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.parking_allocated',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        parkingId: Number(parking.parkingId),
        slotNo: parking.parking_slot_no,
        vehicleNo: parking.vehicle_no,
      },
    }, { transaction });

    await transaction.commit();
    return parking;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    if (error.name === 'SequelizeUniqueConstraintError' || error.parent?.code === 'ER_DUP_ENTRY') {
      const err = new Error(`Parking slot '${data.parking_slot_no}' is already occupied`);
      err.statusCode = 409;
      throw err;
    }
    throw error;
  }
};

export const getAllParkings = async (societyId, query = {}) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = { society_id: societyId, is_deleted: false };
  if (query.status) where.status = query.status;
  if (query.vehicle_type) where.vehicle_type = query.vehicle_type;
  if (query.is_visitor_parking !== undefined) where.is_visitor_parking = query.is_visitor_parking;

  const { rows, count } = await SocietyParking.findAndCountAll({
    where,
    limit,
    offset,
    order: [['parking_slot_no', 'ASC'], ['parkingId', 'ASC']],
    include: [
      { model: User, as: 'owner', attributes: ['userId', 'userName', 'email', 'phone'] }
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

export const getParkingById = async (id, societyId) => {
  return await SocietyParking.findOne({
    where: { parkingId: id, society_id: societyId, is_deleted: false },
    include: [
      { model: User, as: 'owner', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const updateParking = async (id, societyId, data, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const parking = await SocietyParking.findOne({
      where: { parkingId: id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!parking) {
      await transaction.commit();
      return null;
    }

    if (data.parking_slot_no && data.parking_slot_no !== parking.parking_slot_no) {
      const existing = await SocietyParking.findOne({
        where: {
          society_id: societyId,
          parking_slot_no: data.parking_slot_no,
          status: 'active',
          is_deleted: false,
          parkingId: { [Op.ne]: id },
        },
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      if (existing) {
        await transaction.rollback();
        const err = new Error(`Parking slot '${data.parking_slot_no}' is already occupied`);
        err.statusCode = 409;
        throw err;
      }
    }

    const oldValue = parking.toJSON();
    await parking.update({
      ...data,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.parking_updated',
      targetEntityType: 'parking',
      targetEntityId: id,
      oldValue,
      newValue: parking.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return parking;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const softDeleteParking = async (id, societyId, deletedRemarks, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const parking = await SocietyParking.findOne({
      where: { parkingId: id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!parking) {
      await transaction.commit();
      return null;
    }

    await parking.update({
      is_deleted: true,
      deletedRemarks,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.parking_deleted',
      targetEntityType: 'parking',
      targetEntityId: id,
      reason: deletedRemarks,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return parking;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
