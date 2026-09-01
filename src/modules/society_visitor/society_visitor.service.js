import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyVisitor from './society_visitor.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';

// Strict State Transition Map
const ALLOWED_TRANSITIONS = {
  expected: ['at_gate', 'approved', 'denied', 'checked_in'],
  at_gate: ['approved', 'denied', 'checked_in'],
  approved: ['checked_in', 'denied'],
  denied: [],
  checked_in: ['checked_out'],
  checked_out: [],
};

export const createVisitor = async (societyId, callerUserId, data, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const hostUserId = data.user_id || callerUserId;

    // Verify host resident has active society membership
    const membership = await SocietyMember.findOne({
      where: { society_id: societyId, user_id: hostUserId, is_deleted: false, status: 'active' },
      transaction,
    });

    const visitor = await SocietyVisitor.create({
      society_id: societyId,
      user_id: hostUserId,
      visitor_name: data.visitor_name,
      visitor_phone: data.visitor_phone || null,
      purpose: data.purpose || null,
      vehicle_no: data.vehicle_no || null,
      flat_no: data.flat_no || membership?.flat_no || null,
      expected_time: data.expected_time || null,
      status: data.status || 'expected',
      created_by: callerUserId,
      created_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: callerUserId,
      action: 'society.visitor_created',
      targetUserId: hostUserId,
      targetEntityType: 'visitor',
      targetEntityId: visitor.visitorId,
      newValue: { visitor_name: visitor.visitor_name, flat_no: visitor.flat_no },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.visitor_created',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        visitorId: Number(visitor.visitorId),
        visitorName: visitor.visitor_name,
        hostUserId: Number(hostUserId),
        flatNo: visitor.flat_no,
      },
    }, { transaction });

    await transaction.commit();
    return visitor;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getAllVisitors = async (societyId, query = {}, callerUserId = null, isStaff = false) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = { society_id: societyId, is_deleted: false };

  // Residents only see visitors destined for their unit
  if (!isStaff) {
    where.user_id = callerUserId;
  }

  if (query.status) where.status = query.status;
  if (query.flat_no) where.flat_no = query.flat_no;

  const { rows, count } = await SocietyVisitor.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC'], ['visitorId', 'DESC']],
    include: [
      { model: User, as: 'resident', attributes: ['userId', 'userName', 'email', 'phone'] },
      { model: User, as: 'approver', attributes: ['userId', 'userName', 'email', 'phone'] }
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

export const getVisitorById = async (id, societyId, callerUserId = null, isStaff = false) => {
  const where = { visitorId: id, society_id: societyId, is_deleted: false };
  if (!isStaff) {
    where.user_id = callerUserId;
  }

  return await SocietyVisitor.findOne({
    where,
    include: [
      { model: User, as: 'resident', attributes: ['userId', 'userName', 'email', 'phone'] },
      { model: User, as: 'approver', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const updateVisitor = async (id, societyId, data, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const visitor = await SocietyVisitor.findOne({
      where: { visitorId: id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!visitor) {
      await transaction.commit();
      return null;
    }

    const oldValue = visitor.toJSON();
    await visitor.update({
      ...data,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.visitor_updated',
      targetEntityType: 'visitor',
      targetEntityId: id,
      oldValue,
      newValue: visitor.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return visitor;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const updateVisitorStatus = async (id, societyId, { status, remark }, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const visitor = await SocietyVisitor.findOne({
      where: { visitorId: id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!visitor) {
      await transaction.commit();
      return null;
    }

    const currentStatus = visitor.status;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(status)) {
      const err = new Error(`Invalid visitor state transition from '${currentStatus}' to '${status}'`);
      err.statusCode = 422;
      throw err;
    }

    const updatePayload = {
      status,
      remark: remark || visitor.remark,
      updated_by: actorUserId,
      updatedAt: new Date(),
    };

    if (status === 'checked_in') {
      updatePayload.check_in_time = new Date();
    } else if (status === 'checked_out') {
      updatePayload.check_out_time = new Date();
    } else if (status === 'approved') {
      updatePayload.approved_by = actorUserId;
    }

    await visitor.update(updatePayload, { transaction });

    const eventMap = {
      at_gate: 'society.visitor_arrived',
      approved: 'society.visitor_approved',
      denied: 'society.visitor_denied',
      checked_in: 'society.visitor_checked_in',
      checked_out: 'society.visitor_checked_out',
    };

    const outboxEventType = eventMap[status] || 'society.visitor_status_changed';

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: outboxEventType,
      targetUserId: visitor.user_id,
      targetEntityType: 'visitor',
      targetEntityId: id,
      oldValue: { status: currentStatus },
      newValue: { status },
      reason: remark,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: outboxEventType,
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        visitorId: Number(id),
        visitorName: visitor.visitor_name,
        hostUserId: Number(visitor.user_id),
        flatNo: visitor.flat_no,
        status,
        updatedBy: Number(actorUserId),
      },
    }, { transaction });

    await transaction.commit();
    return visitor;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const softDeleteVisitor = async (id, societyId, deletedRemarks, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const visitor = await SocietyVisitor.findOne({
      where: { visitorId: id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!visitor) {
      await transaction.commit();
      return null;
    }

    await visitor.update({
      is_deleted: true,
      deletedRemarks,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.visitor_deleted',
      targetEntityType: 'visitor',
      targetEntityId: id,
      reason: deletedRemarks,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return visitor;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
