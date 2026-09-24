import SocietyWorkerAuthorization from '../society_worker/society_worker_authorization.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import ServiceCategory from '../service_category/service_category.model.js';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyComplaint from './society_complaint.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import SocietyAuditLog from '../society_profile/society_audit_log.model.js';
import ComplaintAssignmentHistory from './complaint_assignment_history.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import { emitNotification } from '../notification/notification.service.js';
import { validateWorkerAuthorization } from '../society_worker/society_worker.service.js';

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
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.complaint_created',
      targetEntityType: 'complaint',
      targetEntityId: Number(complaint.id),
      newValue: { title: complaint.title, category: complaint.category, priority: complaint.priority },
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
        creatorUserId: Number(userId),
        category: complaint.category,
        priority: complaint.priority,
      },
    }, { transaction });

    await transaction.commit();

    // End-to-End Notification: Notify Society Admins / Committee of new complaint
    try {
      const admins = await SocietyMember.findAll({
        where: { society_id: societyId, role: ['admin', 'committee'], status: 'active', is_deleted: false },
        attributes: ['user_id'],
      });
      for (const admin of admins) {
        if (Number(admin.user_id) !== Number(userId)) {
          await emitNotification({
            recipientId: admin.user_id,
            actorId: userId,
            type: 'info',
            title: 'New Complaint Raised',
            message: `New complaint #${complaint.id} raised: "${complaint.title}" (${complaint.category})`,
            data: { complaintId: Number(complaint.id), societyId: Number(societyId) },
          });
        }
      }
    } catch (_notifErr) {
      console.error('[CreateComplaint Notification Error]:', _notifErr);
    }

    return complaint;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getAllComplaints = async (societyId, query = {}, callerUserId = null, isAdminOrCommittee = false) => {
  const {
    page = 1, limit = 20, status, priority, category, location_type, assigned, my_only, search,
  } = query;

  const offset = (Number(page) - 1) * Number(limit);
  const where = { society_id: societyId, is_deleted: false };

  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = { [Op.like]: `%${category}%` };
  if (location_type) where.location_type = location_type;

  if (assigned === 'assigned') where.assigned_to = { [Op.not]: null };
  else if (assigned === 'unassigned') where.assigned_to = null;

  const isMyOnly = my_only === true || my_only === 'true' || my_only === 1 || my_only === '1';

  if (isMyOnly || !isAdminOrCommittee) {
    where[Op.or] = [{ user_id: callerUserId }, { assigned_to: callerUserId }];
  }

  if (search) {
    const searchOr = [
      { title: { [Op.like]: `%${search}%` } },
      { category: { [Op.like]: `%${search}%` } },
    ];
    if (where[Op.or]) {
      where[Op.and] = [{ [Op.or]: where[Op.or] }, { [Op.or]: searchOr }];
      delete where[Op.or];
    } else {
      where[Op.or] = searchOr;
    }
  }

  const { count, rows } = await SocietyComplaint.findAndCountAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] },
      { model: User, as: 'assignee', attributes: ['userId', 'userName', 'email', 'phone'] },
    ],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: Number(limit),
    offset,
  });

  return {
    data: rows,
    total: count,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(count / Number(limit)),
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
    accepted: 0,
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

  // Also fetch assignment history
  const assignmentHistory = await ComplaintAssignmentHistory.findAll({
    where: { complaint_id: id },
    include: [
      { model: User, as: 'assignedByUser', attributes: ['userId', 'userName', 'email'] },
      { model: User, as: 'previousAssignee', attributes: ['userId', 'userName', 'email'] },
      { model: User, as: 'newAssignee', attributes: ['userId', 'userName', 'email'] },
    ],
    order: [['assigned_at', 'ASC']],
  });

  return { audit: history, assignments: assignmentHistory };
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
      { model: User, as: 'assignee', attributes: ['userId', 'userName', 'email', 'phone'] },
    ],
  });
};

/**
 * Update complaint status with strict enterprise state machine.
 * 
 * Worker transitions (accept, start, resolve) are ownership-based:
 *   complaint.assigned_to === actorUserId
 * 
 * Admin transitions can override (skip to assigned/open).
 * Resident transitions: close (from resolved) and reopen (from closed).
 */
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

    const current = complaint.status;

    // Strict enterprise state machine
    const allowedTransitions = {
      open:        ['assigned', 'in_progress', 'resolved', 'closed'],                     // only admin can assign → status changes to assigned
      assigned:    ['accepted', 'open'],              // worker accepts OR admin unassigns (→ open)
      accepted:    ['in_progress', 'assigned'],       // worker starts OR admin reverts
      in_progress: ['resolved', 'accepted'],          // worker resolves OR reverts to accepted
      resolved:    ['closed', 'open'],                // resident closes OR admin reopens
      closed:      ['open'],                          // admin/resident reopens
    };

    if (current !== status && (!allowedTransitions[current] || !allowedTransitions[current].includes(status))) {
      const err = new Error(`Cannot transition complaint status from '${current}' to '${status}'. Invalid transition.`);
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

    // Set timestamps based on new status
    if (status === 'accepted' && !complaint.accepted_at) {
      updatePayload.accepted_at = new Date();
      updatePayload.accepted_by = actorUserId;
    }
    if (status === 'in_progress' && !complaint.started_at) {
      updatePayload.started_at = new Date();
    }
    if (status === 'resolved' && !complaint.resolved_at) {
      updatePayload.resolved_at = new Date();
      if (remark) updatePayload.resolution_note = remark;
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
        assignedTo: complaint.assigned_to ? Number(complaint.assigned_to) : null,
        oldStatus: current,
        status,
        updatedBy: Number(actorUserId),
      },
    }, { transaction });

    await transaction.commit();

    // End-to-End Notification: Notify all parties on status transitions
    try {
      const residentId = Number(complaint.user_id);
      const workerId = complaint.assigned_to ? Number(complaint.assigned_to) : null;
      const adminId = complaint.updated_by ? Number(complaint.updated_by) : Number(complaint.created_by);

      if (status === 'accepted') {
        // 1. Notify Resident that worker accepted
        if (residentId && residentId !== Number(actorUserId)) {
          await emitNotification({
            recipientId: residentId,
            actorId: actorUserId,
            type: 'info',
            title: 'Worker Accepted Task',
            message: `Worker has accepted your complaint: "${complaint.title}". They will begin work shortly.`,
            data: { complaintId: Number(id), societyId: Number(societyId) },
          });
        }
        // 2. Notify Admin that worker accepted
        if (adminId && adminId !== Number(actorUserId) && adminId !== residentId) {
          await emitNotification({
            recipientId: adminId,
            actorId: actorUserId,
            type: 'info',
            title: 'Task Accepted by Worker',
            message: `Worker accepted complaint #${id} ("${complaint.title}").`,
            data: { complaintId: Number(id), societyId: Number(societyId) },
          });
        }
      } else if (status === 'in_progress') {
        // Notify Resident that work started
        if (residentId && residentId !== Number(actorUserId)) {
          await emitNotification({
            recipientId: residentId,
            actorId: actorUserId,
            type: 'info',
            title: 'Work In Progress',
            message: `Maintenance work has started for your complaint: "${complaint.title}".`,
            data: { complaintId: Number(id), societyId: Number(societyId) },
          });
        }
      } else if (status === 'resolved') {
        // 1. Notify Resident to review and close
        if (residentId && residentId !== Number(actorUserId)) {
          await emitNotification({
            recipientId: residentId,
            actorId: actorUserId,
            type: 'info',
            title: 'Complaint Resolved',
            message: `Your complaint "${complaint.title}" has been marked as resolved. Please review and close.`,
            data: { complaintId: Number(id), societyId: Number(societyId) },
          });
        }
        // 2. Notify Admin that work is resolved
        if (adminId && adminId !== Number(actorUserId) && adminId !== residentId) {
          await emitNotification({
            recipientId: adminId,
            actorId: actorUserId,
            type: 'info',
            title: 'Complaint Resolved by Worker',
            message: `Complaint #${id} ("${complaint.title}") has been marked as resolved.`,
            data: { complaintId: Number(id), societyId: Number(societyId) },
          });
        }
      } else if (status === 'closed') {
        // 1. Notify Worker that task is closed & verified
        if (workerId && workerId !== Number(actorUserId)) {
          await emitNotification({
            recipientId: workerId,
            actorId: actorUserId,
            type: 'info',
            title: 'Task Verified & Closed',
            message: `Your completed task for complaint #${id} ("${complaint.title}") has been closed by the resident.`,
            data: { complaintId: Number(id), societyId: Number(societyId) },
          });
        }
        // 2. Notify Admin that complaint is closed
        if (adminId && adminId !== Number(actorUserId) && adminId !== residentId) {
          await emitNotification({
            recipientId: adminId,
            actorId: actorUserId,
            type: 'info',
            title: 'Complaint Closed',
            message: `Complaint #${id} ("${complaint.title}") has been closed.`,
            data: { complaintId: Number(id), societyId: Number(societyId) },
          });
        }
      }
    } catch (_notifErr) {
      console.error('[UpdateComplaintStatus Notification Error]:', _notifErr);
    }

    return complaint;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

/**
 * Enterprise complaint assignment.
 * Validates:
 * 1. Complaint exists in caller's society
 * 2. Assignee != creator
 * 3. Assignee has ACTIVE worker authorization for this society (NOT role-based)
 * 4. If assignee is a marketplace provider, they must be society-authorized
 * Records full assignment history.
 */
export const assignComplaint = async (id, societyId, { assigned_to, reason }, actorUserId, meta = {}) => {
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

    // Security: Cannot assign to self-creator
    if (Number(assigned_to) === Number(complaint.user_id)) {
      const err = new Error('Cannot assign complaint to the resident who raised it');
      err.statusCode = 400;
      throw err;
    }

    // Security: Assignee must be an active AUTHORIZED WORKER for this society
    // We check society_worker_authorizations — NOT society_members.role
    let authorization = await validateWorkerAuthorization(societyId, assigned_to);

    if (!authorization) {
      // Auto-empanel: Check if assignee is a registered platform Service Provider -> auto-authorize for this society!
      const providerProfile = await ServiceProviderProfile.findOne({
        where: { user_id: assigned_to, is_deleted: false },
        include: [{ model: ServiceCategory, as: 'category' }],
        transaction,
      });

      if (providerProfile) {
        authorization = await SocietyWorkerAuthorization.create({
          society_id: societyId,
          user_id: assigned_to,
          designation: providerProfile.category?.serviceCategoryName || 'Service Provider',
          authorization_status: 'active',
          service_provider_profile_id: providerProfile.id,
          created_by: actorUserId,
          notes: 'Auto-authorized via Complaint Assignment',
        }, { transaction });

        await logSocietyAudit({
          societyId,
          actorUserId,
          action: 'society.worker_authorized',
          targetEntityType: 'society_worker_authorization',
          targetEntityId: Number(authorization.id),
          newValue: { assigned_to, complaint_id: id },
          requestId: meta.requestId,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        }, { transaction });
      } else {
        // Fallback: allow admin/committee members who are society members (for reassignment by admin to themselves)
        const memberRecord = await SocietyMember.findOne({
          where: {
            society_id: societyId,
            user_id: assigned_to,
            status: 'active',
            role: { [Op.in]: ['admin', 'committee'] },
            is_deleted: false,
          },
          transaction,
        });

        if (!memberRecord) {
          const err = new Error('Assignee must be an active authorized worker for this society. Please authorize them first via Worker Management.');
          err.statusCode = 400;
          throw err;
        }
      }
    }

    // Track reassignment history
    const previousAssigneeId = complaint.assigned_to || null;
    const isReassignment = previousAssigneeId && Number(previousAssigneeId) !== Number(assigned_to);
    const actionType = previousAssigneeId
      ? (Number(assigned_to) === 0 ? 'unassigned' : 'reassigned')
      : 'assigned';

    await ComplaintAssignmentHistory.create({
      complaint_id: id,
      previous_assignee_id: previousAssigneeId,
      new_assignee_id: assigned_to,
      assigned_by: actorUserId,
      action_type: actionType,
      reason: reason || null,
      assigned_at: new Date(),
    }, { transaction });

    const updatePayload = {
      assigned_to,
      updated_by: actorUserId,
      updatedAt: new Date(),
      // On reassignment, reset worker acceptance timestamps
      ...(isReassignment ? { accepted_at: null, accepted_by: null, started_at: null } : {}),
    };

    // Transition to 'assigned' from any non-terminal status
    if (['open', 'accepted', 'in_progress'].includes(complaint.status)) {
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
      oldValue: { assigned_to: previousAssigneeId, status: complaint.status },
      newValue: { assigned_to, status: updatePayload.status || complaint.status },
      reason,
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
        previousAssignee: previousAssigneeId ? Number(previousAssigneeId) : null,
        assignedBy: Number(actorUserId),
        isReassignment,
      },
    }, { transaction });

    await transaction.commit();

    // End-to-End Notification: Notify Assigned Worker AND Resident
    try {
      // 1. Notify Worker
      await emitNotification({
        recipientId: assigned_to,
        actorId: actorUserId,
        type: 'info',
        title: 'Task Assigned to You',
        message: `You have been assigned: "${complaint.title}" (${complaint.category})`,
        data: { complaintId: Number(id), societyId: Number(societyId) },
      });

      // 2. Notify Resident who raised the complaint
      if (complaint.user_id && Number(complaint.user_id) !== Number(actorUserId)) {
        await emitNotification({
          recipientId: complaint.user_id,
          actorId: actorUserId,
          type: 'info',
          title: 'Worker Assigned to Your Complaint',
          message: `A worker has been assigned to your complaint: "${complaint.title}".`,
          data: { complaintId: Number(id), societyId: Number(societyId) },
        });
      }
    } catch (_notifErr) {
      console.error('[AssignComplaint Notification Error]:', _notifErr);
    }

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
