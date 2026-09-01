import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyComplaint from './society_complaint.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';

export const createComplaint = async (societyId, userId, complaintData, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const complaint = await SocietyComplaint.create({
      society_id: societyId,
      user_id: userId,
      title: complaintData.title,
      description: complaintData.description,
      category: complaintData.category || 'general',
      priority: complaintData.priority || 'medium',
      status: 'open',
      created_by: userId,
      created_at: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.complaint_created',
      targetEntityType: 'complaint',
      targetEntityId: complaint.id,
      newValue: { title: complaint.title, priority: complaint.priority, status: complaint.status },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.complaint_created',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        complaintId: Number(complaint.id),
        title: complaint.title,
        priority: complaint.priority,
        userId: Number(userId),
      },
    }, { transaction });

    await transaction.commit();
    return complaint;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getAllComplaints = async (societyId, query = {}, callerUserId = null, isAdminOrCommittee = false) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = { society_id: societyId, is_deleted: false };

  // Scoping: Normal resident only sees own complaints unless they request otherwise and are authorized
  if (!isAdminOrCommittee || query.my_only) {
    where.user_id = callerUserId;
  }

  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.category) where.category = query.category;

  const { rows, count } = await SocietyComplaint.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] },
      { model: User, as: 'assignee', attributes: ['userId', 'userName', 'email', 'phone'] }
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

export const getComplaintById = async (id, societyId, callerUserId = null, isAdminOrCommittee = false) => {
  const where = { id, society_id: societyId, is_deleted: false };
  if (!isAdminOrCommittee) {
    where[Op.or] = [
      { user_id: callerUserId },
      { assigned_to: callerUserId },
    ];
  }

  return await SocietyComplaint.findOne({
    where,
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] },
      { model: User, as: 'assignee', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const updateComplaintStatus = async (id, societyId, { status, remark }, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const complaint = await SocietyComplaint.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!complaint) {
      await transaction.commit();
      return null;
    }

    const oldValue = { status: complaint.status };
    const updatePayload = {
      status,
      remark: remark || complaint.remark,
      updated_by: actorUserId,
      updatedAt: new Date(),
    };

    if (status === 'resolved' && !complaint.resolved_at) {
      updatePayload.resolved_at = new Date();
    }
    if (status === 'closed' && !complaint.closed_at) {
      updatePayload.closed_at = new Date();
    }

    await complaint.update(updatePayload, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.complaint_status_changed',
      targetEntityType: 'complaint',
      targetEntityId: id,
      oldValue,
      newValue: { status },
      reason: remark,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.complaint_status_changed',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        complaintId: Number(id),
        creatorUserId: Number(complaint.user_id),
        status,
        updatedBy: Number(actorUserId),
      },
    }, { transaction });

    await transaction.commit();
    return complaint;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const assignComplaint = async (id, societyId, { assigned_to }, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const complaint = await SocietyComplaint.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!complaint) {
      await transaction.commit();
      return null;
    }

    const updatePayload = {
      assigned_to,
      updated_by: actorUserId,
      updatedAt: new Date(),
    };
    if (complaint.status === 'open') {
      updatePayload.status = 'assigned';
    }

    await complaint.update(updatePayload, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.complaint_assigned',
      targetUserId: assigned_to,
      targetEntityType: 'complaint',
      targetEntityId: id,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return complaint;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const softDeleteComplaint = async (id, societyId, deletedRemarks, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const complaint = await SocietyComplaint.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!complaint) {
      await transaction.commit();
      return null;
    }

    await complaint.update({
      is_deleted: true,
      deletedRemarks,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.complaint_deleted',
      targetEntityType: 'complaint',
      targetEntityId: id,
      reason: deletedRemarks,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return complaint;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};
