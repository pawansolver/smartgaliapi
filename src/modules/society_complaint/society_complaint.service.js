import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyComplaint from './society_complaint.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import SocietyAuditLog from '../society_profile/society_audit_log.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import { emitNotification } from '../notification/notification.service.js';

export const createComplaint = async (societyId, userId, complaintData, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const complaint = await SocietyComplaint.create({
      society_id: societyId,
      user_id: userId,
      title: complaintData.title,
      description: complaintData.description,
      category: complaintData.category || 'general',
      sub_category: complaintData.sub_category || null,
      location_type: complaintData.location_type || null,
      flat_no: complaintData.flat_no || null,
      exact_location: complaintData.exact_location || null,
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

  if (query.status && query.status !== 'all') where.status = query.status;
  if (query.priority && query.priority !== 'all') where.priority = query.priority;
  if (query.category && query.category !== 'all') where.category = query.category;
  if (query.location_type && query.location_type !== 'all') where.location_type = query.location_type;

  if (query.assigned === 'assigned') {
    where.assigned_to = { [Op.ne]: null };
  } else if (query.assigned === 'unassigned') {
    where.assigned_to = null;
  }

  if (query.search && query.search.trim()) {
    const term = query.search.trim();
    const searchConditions = [
      { title: { [Op.like]: '%' + term + '%' } },
      { flat_no: { [Op.like]: '%' + term + '%' } },
      { category: { [Op.like]: '%' + term + '%' } },
      { sub_category: { [Op.like]: '%' + term + '%' } },
      { '$user.userName$': { [Op.like]: '%' + term + '%' } },
    ];
    const cleanedNum = term.replace(/^[#]?(CMP-)?/i, '');
    if (/^\d+$/.test(cleanedNum)) {
      searchConditions.push({ id: parseInt(cleanedNum, 10) });
    }
    where[Op.or] = searchConditions;
  }

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

export const getComplaintSummary = async (societyId) => {
  const counts = await SocietyComplaint.findAll({
    where: { society_id: societyId, is_deleted: false },
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    group: ['status'],
    raw: true,
  });

  const summary = {
    total: 0,
    open: 0,
    assigned: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
  };

  counts.forEach(row => {
    const c = parseInt(row.count, 10) || 0;
    summary.total += c;
    if (summary[row.status] !== undefined) {
      summary[row.status] = c;
    }
  });

  return summary;
};

export const getComplaintHistory = async (id, societyId) => {
  const history = await SocietyAuditLog.findAll({
    where: {
      society_id: societyId,
      target_entity_type: 'complaint',
      target_entity_id: id,
    },
    include: [
      { model: User, as: 'actor', attributes: ['userId', 'userName', 'email', 'phone'] },
      { model: User, as: 'targetUser', attributes: ['userId', 'userName', 'email', 'phone'] },
    ],
    order: [['created_at', 'ASC'], ['id', 'ASC']],
  });

  return history;
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

    // Lifecycle transition guards
    const current = complaint.status;
    const allowedTransitions = {
      open: ['assigned', 'in_progress', 'resolved'],
      assigned: ['in_progress', 'resolved', 'open'],
      in_progress: ['resolved', 'assigned'],
      resolved: ['closed', 'open', 'in_progress'],
      closed: ['open'],
    };

    if (current !== status && (!allowedTransitions[current] || !allowedTransitions[current].includes(status))) {
      const err = new Error(`Cannot transition complaint status from ${current} to ${status}`);
      err.statusCode = 400;
      throw err;
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

    // Validation 1: Prevent assigning complaint to the resident creator
    if (Number(assigned_to) === Number(complaint.user_id)) {
      const err = new Error('Cannot assign complaint to the resident who raised it');
      err.statusCode = 400;
      throw err;
    }

    // Validation 2: Ensure assignee is an active member of this society
    const assigneeMember = await SocietyMember.findOne({
      where: {
        society_id: societyId,
        user_id: assigned_to,
        status: 'active',
        is_deleted: false,
      },
      transaction,
    });

    if (!assigneeMember) {
      const err = new Error('Assignee must be an active member of this society');
      err.statusCode = 400;
      throw err;
    }

    if (!['admin', 'committee'].includes(assigneeMember.role)) {
      const err = new Error('Assignee must have an authorized role (admin or committee)');
      err.statusCode = 400;
      throw err;
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
      newValue: { assigned_to, status: updatePayload.status || complaint.status },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.complaint_assigned',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        complaintId: Number(id),
        creatorUserId: Number(complaint.user_id),
        assignedTo: Number(assigned_to),
        assignedBy: Number(actorUserId),
      },
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