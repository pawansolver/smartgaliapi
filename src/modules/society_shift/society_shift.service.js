import { SocietyShift } from './society_shift.model.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';

export const createShift = async (societyId, actorUserId, data, meta = {}) => {
  const shift = await SocietyShift.create({
    society_id: societyId,
    shift_name: data.shift_name.trim(),
    start_time: data.start_time || '07:00',
    end_time: data.end_time || '19:00',
    break_start: data.break_start || null,
    break_end: data.break_end || null,
    weekly_off: data.weekly_off || 'Sunday',
    status: data.status || 'active',
    created_by: actorUserId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'society.shift_created',
    targetEntityType: 'shift',
    targetEntityId: shift.id,
    newValue: { shift_name: shift.shift_name, start_time: shift.start_time, end_time: shift.end_time },
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return shift;
};

export const getShifts = async (societyId, query = {}) => {
  const where = { society_id: societyId, is_deleted: false };
  if (query.status) where.status = query.status;

  return await SocietyShift.findAll({
    where,
    order: [['start_time', 'ASC']],
  });
};

export const getShiftById = async (id, societyId) => {
  return await SocietyShift.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
};

export const updateShift = async (id, societyId, data, actorUserId, meta = {}) => {
  const shift = await SocietyShift.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!shift) return null;

  const oldValue = shift.toJSON();
  await shift.update({
    shift_name: data.shift_name !== undefined ? data.shift_name.trim() : shift.shift_name,
    start_time: data.start_time || shift.start_time,
    end_time: data.end_time || shift.end_time,
    break_start: data.break_start !== undefined ? data.break_start : shift.break_start,
    break_end: data.break_end !== undefined ? data.break_end : shift.break_end,
    weekly_off: data.weekly_off || shift.weekly_off,
    status: data.status || shift.status,
    updated_by: actorUserId,
    updated_at: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'society.shift_updated',
    targetEntityType: 'shift',
    targetEntityId: id,
    oldValue,
    newValue: shift.toJSON(),
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return shift;
};

export const deleteShift = async (id, societyId, actorUserId, meta = {}) => {
  const shift = await SocietyShift.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!shift) return null;

  await shift.update({
    is_deleted: true,
    status: 'inactive',
    updated_by: actorUserId,
    updated_at: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'society.shift_deleted',
    targetEntityType: 'shift',
    targetEntityId: id,
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return true;
};
