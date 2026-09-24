import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyVisitor from './society_visitor.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import { emitNotification } from '../notification/notification.service.js';

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

    // Notify Resident if visitor is at gate
    if (hostUserId && (visitor.status === 'at_gate' || visitor.status === 'expected')) {
      try {
        await emitNotification(hostUserId, {
          title: visitor.status === 'at_gate' ? 'Visitor at Gate!' : 'Expected Visitor Registered',
          body: `${visitor.visitor_name} (${visitor.purpose || 'Visit'}) is ${visitor.status === 'at_gate' ? 'at the gate' : 'expected'} for Flat ${visitor.flat_no || ''}.`,
          type: 'society_visitor',
          entityId: String(visitor.visitorId),
          societyId: Number(societyId),
        });
      } catch (err) {
        // notification non-blocking
      }
    }

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

export const updateVisitorStatus = async (id, societyId, { status, remark, reason, gate_id }, actorUserId, meta = {}) => {
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

    // Role and host authorization check
    const member = await SocietyMember.findOne({
      where: { society_id: societyId, user_id: actorUserId, is_deleted: false, status: 'active' },
      transaction,
    });
    const role = member ? member.role : 'resident';
    const isStaffOrAdmin = ['admin', 'committee', 'security', 'staff'].includes(role) || meta.isGlobalAdmin;

    // Gate operations (at_gate, checked_in, checked_out) are strictly for security/staff/admin
    if (['at_gate', 'checked_in', 'checked_out'].includes(status) && !isStaffOrAdmin) {
      const err = new Error('Only security staff or society admins can perform gate check-in/out');
      err.statusCode = 403;
      throw err;
    }

    // Flat-level approval/denial (approved, denied) can be done by host resident OR security/staff/admin
    if (['approved', 'denied'].includes(status)) {
      const isHost = Number(visitor.user_id) === Number(actorUserId);
      if (!isStaffOrAdmin && !isHost) {
        const err = new Error('You are not authorized to approve or deny visitors for another resident');
        err.statusCode = 403;
        throw err;
      }
    }

    const updatePayload = {
      status,
      remark: remark || visitor.remark,
      updated_by: actorUserId,
      updatedAt: new Date(),
    };

    if (status === 'checked_in') {
      updatePayload.check_in_time = new Date();
      updatePayload.approval_status = 'approved';
      if (gate_id) updatePayload.gate_id = gate_id;
    } else if (status === 'checked_out') {
      updatePayload.check_out_time = new Date();
    } else if (status === 'approved') {
      updatePayload.approved_by = actorUserId;
      updatePayload.approved_at = new Date();
      updatePayload.approval_status = 'approved';
    } else if (status === 'denied') {
      updatePayload.rejected_by = actorUserId;
      updatePayload.rejected_at = new Date();
      updatePayload.rejection_reason = reason || remark || 'Denied by resident';
      updatePayload.approval_status = 'rejected';
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
      newValue: {
        status,
        check_in_time: updatePayload.check_in_time,
        check_out_time: updatePayload.check_out_time,
        operator_id: actorUserId,
        gate_id: updatePayload.gate_id || visitor.gate_id,
      },
      reason: remark || reason,
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
        checkInTime: updatePayload.check_in_time,
        checkOutTime: updatePayload.check_out_time,
      },
    }, { transaction });

    await transaction.commit();

    // ── Emit Real-time & Push Notifications for Status Changes ──
    try {
      let hostId = visitor.user_id;
      if (!hostId && visitor.flat_no) {
        try {
          const flatMem = await SocietyMember.findOne({
            where: { society_id: societyId, flat_no: visitor.flat_no, is_deleted: false, status: 'active' },
          });
          if (flatMem) hostId = flatMem.user_id;
        } catch (_) {}
      }

      if (status === 'approved' || status === 'denied') {
        // Notify guard/gate staff
        const guardUserIds = new Set();
        if (visitor.created_by && Number(visitor.created_by) !== Number(actorUserId)) {
          guardUserIds.add(Number(visitor.created_by));
        }
        if (visitor.guard_id) {
          try {
            const guard = await SocietyGuardAuthorization.findByPk(visitor.guard_id);
            if (guard && Number(guard.user_id) !== Number(actorUserId)) {
              guardUserIds.add(Number(guard.user_id));
            }
          } catch (_) {}
        }
        try {
          const staffMembers = await SocietyMember.findAll({
            where: { society_id: societyId, role: 'staff', status: 'active', is_deleted: false },
          });
          for (const sm of staffMembers) {
            if (Number(sm.user_id) !== Number(actorUserId)) {
              guardUserIds.add(Number(sm.user_id));
            }
          }
        } catch (_) {}

        for (const gid of guardUserIds) {
          try {
            await emitNotification(gid, {
              title: status === 'approved' ? 'Visitor Approved' : 'Visitor Rejected',
              body: `Resident ${status === 'approved' ? 'approved' : 'rejected'} visitor ${visitor.visitor_name} for flat ${visitor.flat_no || 'N/A'}.`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId || id,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status,
              },
            });
          } catch (_) {}
        }
      } else if (status === 'at_gate') {
        if (hostId && Number(hostId) !== Number(actorUserId)) {
          try {
            await emitNotification(hostId, {
              title: 'Visitor at Gate!',
              body: `${visitor.visitor_name} is waiting at the gate for Flat ${visitor.flat_no || 'N/A'}.`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId || id,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: 'at_gate',
              },
            });
          } catch (_) {}
        }
      } else if (status === 'checked_in') {
        // 1. Notify Resident (Host)
        if (hostId && Number(hostId) !== Number(actorUserId)) {
          try {
            await emitNotification(hostId, {
              title: 'Visitor Entered Gate',
              body: `${visitor.visitor_name} has checked in at the gate.`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId || id,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: 'checked_in',
                checkInTime: updatePayload.check_in_time,
              },
            });
          } catch (_) {}
        }

        // 2. Notify Society Admins / Committee
        try {
          const admins = await SocietyMember.findAll({
            where: { society_id: societyId, role: ['admin', 'committee'], status: 'active', is_deleted: false },
          });
          for (const admin of admins) {
            if (Number(admin.user_id) !== Number(actorUserId) && Number(admin.user_id) !== Number(hostId)) {
              await emitNotification(admin.user_id, {
                title: 'Visitor Checked In',
                body: `${visitor.visitor_name} (Flat ${visitor.flat_no || 'N/A'}) has checked in at the gate.`,
                type: 'info',
                societyId: Number(societyId),
                data: {
                  visitorId: visitor.visitorId || id,
                  societyId: Number(societyId),
                  flatNo: visitor.flat_no,
                  type: 'society_visitor',
                  status: 'checked_in',
                  checkInTime: updatePayload.check_in_time,
                },
              });
            }
          }
        } catch (_) {}
      } else if (status === 'checked_out') {
        // 1. Notify Resident (Host)
        if (hostId && Number(hostId) !== Number(actorUserId)) {
          try {
            await emitNotification(hostId, {
              title: 'Visitor Checked Out',
              body: `Visitor ${visitor.visitor_name} (Flat ${visitor.flat_no || ''}) has checked out and departed from the society.`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId || id,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: 'checked_out',
                checkOutTime: updatePayload.check_out_time,
              },
            });
          } catch (_) {}
        }

        // 2. Notify Society Admins / Committee
        try {
          const admins = await SocietyMember.findAll({
            where: { society_id: societyId, role: ['admin', 'committee'], status: 'active', is_deleted: false },
          });
          for (const admin of admins) {
            if (Number(admin.user_id) !== Number(actorUserId) && Number(admin.user_id) !== Number(hostId)) {
              await emitNotification(admin.user_id, {
                title: 'Visitor Checked Out',
                body: `${visitor.visitor_name} (Flat ${visitor.flat_no || 'N/A'}) has checked out of society campus.`,
                type: 'info',
                societyId: Number(societyId),
                data: {
                  visitorId: visitor.visitorId || id,
                  societyId: Number(societyId),
                  flatNo: visitor.flat_no,
                  type: 'society_visitor',
                  status: 'checked_out',
                  checkOutTime: updatePayload.check_out_time,
                },
              });
            }
          }
        } catch (_) {}
      }
    } catch (notifErr) {
      console.error('Error emitting visitor status notification:', notifErr);
    }

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
