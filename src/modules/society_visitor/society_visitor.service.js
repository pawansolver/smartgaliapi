import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyVisitor from './society_visitor.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import SocietyGuardAuthorization from '../society_guard/society_guard_authorization.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import { emitNotification } from '../notification/notification.service.js';
import { getIO } from '../../socket.js';


/**
 * Helper to fetch all active guard user IDs for a given society.
 * Checks both SocietyGuardAuthorization (active status) and SocietyMember (guard/security/staff role).
 */
export const getActiveGuardUserIds = async (societyId, excludeUserId = null) => {
  const guardUserIds = new Set();
  try {
    const guards = await SocietyGuardAuthorization.findAll({
      where: { society_id: societyId, status: 'active', is_deleted: false },
      attributes: ['user_id'],
    });
    for (const g of guards) {
      if (g.user_id && (!excludeUserId || Number(g.user_id) !== Number(excludeUserId))) {
        guardUserIds.add(Number(g.user_id));
      }
    }
  } catch (err) {
    console.error('Error fetching guard authorizations:', err);
  }

  try {
    const staffMembers = await SocietyMember.findAll({
      where: {
        society_id: societyId,
        role: ['staff', 'security', 'guard'],
        status: 'active',
        is_deleted: false,
      },
      attributes: ['user_id'],
    });
    for (const sm of staffMembers) {
      if (sm.user_id && (!excludeUserId || Number(sm.user_id) !== Number(excludeUserId))) {
        guardUserIds.add(Number(sm.user_id));
      }
    }
  } catch (err) {
    console.error('Error fetching guard society members:', err);
  }

  return Array.from(guardUserIds);
};

/**
 * Helper to fetch all active admin and committee member user IDs for a given society.
 */
export const getActiveAdminAndCommitteeUserIds = async (societyId, excludeUserId = null) => {
  const userIds = new Set();
  try {
    const members = await SocietyMember.findAll({
      where: {
        society_id: societyId,
        role: ['admin', 'committee', 'owner'],
        status: 'active',
        is_deleted: false,
      },
      attributes: ['user_id'],
    });
    for (const m of members) {
      if (m.user_id && (!excludeUserId || Number(m.user_id) !== Number(excludeUserId))) {
        userIds.add(Number(m.user_id));
      }
    }
  } catch (err) {
    console.error('Error fetching admin/committee members:', err);
  }
  return Array.from(userIds);
};

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
    const hostUserId = data.user_id || data.host_resident_id || callerUserId;

    // Verify host resident has active society membership
    const membership = await SocietyMember.findOne({
      where: { society_id: societyId, user_id: hostUserId, is_deleted: false, status: 'active' },
      transaction,
    });

    const isPreApproved = data.status === 'expected' || data.status === 'approved' || data.entry_type === 'expected';

    const visitor = await SocietyVisitor.create({
      society_id: societyId,
      user_id: hostUserId,
      visitor_name: data.visitor_name,
      visitor_phone: data.visitor_phone || data.phone_number || null,
      purpose: data.purpose || null,
      vehicle_no: data.vehicle_no || data.vehicle_number || data.cab_number || null,
      flat_no: data.flat_no || membership?.flat_no || null,
      expected_time: data.expected_time || null,
      status: data.status || 'expected',
      visitor_type: data.visitor_type || 'guest',
      company_name: data.company_name || null,
      driver_name: data.driver_name || null,
      cab_number: data.cab_number || null,
      service_category: data.service_category || null,
      worker_type: data.worker_type || null,
      vehicle_type: data.vehicle_type || 'none',
      entry_type: data.entry_type || (data.status === 'at_gate' ? 'walk_in' : 'expected'),
      gate_id: data.gate_id || null,
      guard_id: data.guard_id || null,
      id_type: data.id_type || null,
      id_number: data.id_number || null,
      approval_status: isPreApproved ? 'approved' : 'pending',
      approved_by: isPreApproved ? callerUserId : null,
      approved_at: isPreApproved ? new Date() : null,
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
      newValue: { visitor_name: visitor.visitor_name, flat_no: visitor.flat_no, status: visitor.status },
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
        status: visitor.status,
      },
    }, { transaction });

    await transaction.commit();

    // ── Emit Real-time & Push Notifications for Visitor Creation / Pre-approval ──
    try {
      const guardUserIds = await getActiveGuardUserIds(societyId, callerUserId);
      const adminCommitteeUserIds = await getActiveAdminAndCommitteeUserIds(societyId, callerUserId);
      const flatLabel = visitor.flat_no ? `Flat ${visitor.flat_no}` : 'Resident';

      if (isPreApproved) {
        // 1. Notify Guard(s) at Gate
        for (const gid of guardUserIds) {
          try {
            await emitNotification(gid, {
              title: 'Visitor Pre-Approved',
              body: `${flatLabel}: ${visitor.visitor_name} has been pre-approved for entry${visitor.purpose ? ` (${visitor.purpose})` : ''}.`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: visitor.status,
                action: 'pre_approved',
                hostUserId: Number(hostUserId),
                visitorName: visitor.visitor_name,
                purpose: visitor.purpose,
                vehicleNo: visitor.vehicle_no,
                expectedTime: visitor.expected_time,
              },
            });
          } catch (notifErr) {
            console.error('Error notifying guard of pre-approved visitor:', notifErr);
          }
        }

        // 2. Notify Committee Members & Admins
        for (const aid of adminCommitteeUserIds) {
          try {
            await emitNotification(aid, {
              title: 'Visitor Pre-Approved',
              body: `${flatLabel}: Resident pre-approved visitor ${visitor.visitor_name}${visitor.purpose ? ` (${visitor.purpose})` : ''}.`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: visitor.status,
                action: 'pre_approved',
                hostUserId: Number(hostUserId),
                visitorName: visitor.visitor_name,
                purpose: visitor.purpose,
                vehicleNo: visitor.vehicle_no,
                expectedTime: visitor.expected_time,
              },
            });
          } catch (notifErr) {
            console.error('Error notifying admin/committee of pre-approved visitor:', notifErr);
          }
        }

        // 3. Confirm to Host Resident
        if (hostUserId) {
          try {
            await emitNotification(hostUserId, {
              title: 'Expected Visitor Registered',
              body: `${visitor.visitor_name} (${visitor.purpose || 'Visit'}) is pre-approved for ${flatLabel}. Gate security has been notified.`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: visitor.status,
                action: 'pre_approved',
              },
            });
          } catch (_) {}
        }
      } else if (visitor.status === 'at_gate') {
        // Visitor is waiting at the gate -> Notify host resident
        if (hostUserId && Number(hostUserId) !== Number(callerUserId)) {
          try {
            await emitNotification(hostUserId, {
              title: 'Visitor at Gate!',
              body: `${visitor.visitor_name} (${visitor.purpose || 'Visit'}) is waiting at the gate for ${flatLabel}. Please approve or deny entry.`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: 'at_gate',
              },
            });
          } catch (_) {}
        }

        // Also notify Committee & Admins of visitor arrival
        for (const aid of adminCommitteeUserIds) {
          try {
            await emitNotification(aid, {
              title: 'Visitor at Gate',
              body: `${visitor.visitor_name} has arrived at the gate for ${flatLabel}.`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: 'at_gate',
              },
            });
          } catch (_) {}
        }
      }

      // Real-time socket emission
      try {
        const io = getIO();
        if (io) {
          const socketPayload = {
            societyId: Number(societyId),
            visitorId: Number(visitor.visitorId),
            visitorName: visitor.visitor_name,
            flatNo: visitor.flat_no,
            status: visitor.status,
            entryType: visitor.entry_type || 'expected',
            purpose: visitor.purpose,
            vehicleNo: visitor.vehicle_no,
            hostUserId: Number(hostUserId),
            action: isPreApproved ? 'pre_approved' : 'at_gate',
          };
          io.to(`society:${societyId}`).emit('society:visitor_created', socketPayload);
          io.to(`society:${societyId}`).emit('society.visitor_created', socketPayload);
          for (const gid of guardUserIds) {
            io.to(`user:${gid}`).emit('society:visitor_created', socketPayload);
          }
          for (const aid of adminCommitteeUserIds) {
            io.to(`user:${aid}`).emit('society:visitor_created', socketPayload);
          }
          if (hostUserId) {
            io.to(`user:${hostUserId}`).emit('society:visitor_created', socketPayload);
          }
        }
      } catch (_) {}
    } catch (notifErr) {
      console.error('Error in visitor creation notifications:', notifErr);
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
      const isHost = Number(visitor.user_id) === Number(actorUserId) || (member && member.flat_no && visitor.flat_no && String(member.flat_no).trim().toLowerCase() === String(visitor.flat_no).trim().toLowerCase());
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

      const guardUserIds = await getActiveGuardUserIds(societyId, actorUserId);
      if (visitor.created_by && Number(visitor.created_by) !== Number(actorUserId) && !guardUserIds.includes(Number(visitor.created_by))) {
        guardUserIds.push(Number(visitor.created_by));
      }
      const adminCommitteeUserIds = await getActiveAdminAndCommitteeUserIds(societyId, actorUserId);
      const flatLabel = visitor.flat_no ? `Flat ${visitor.flat_no}` : 'resident unit';

      if (status === 'approved') {
        // 1. Notify all Guards at Gate
        for (const gid of guardUserIds) {
          try {
            await emitNotification(gid, {
              title: 'Visitor Approved',
              body: `Resident approved visitor ${visitor.visitor_name} for ${flatLabel}. Allow gate entry.`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId || id,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: 'approved',
              },
            });
          } catch (_) {}
        }

        // 2. Notify Committee Members & Admins
        for (const aid of adminCommitteeUserIds) {
          try {
            await emitNotification(aid, {
              title: 'Visitor Approved',
              body: `Resident approved visitor ${visitor.visitor_name} for ${flatLabel}.`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId || id,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: 'approved',
              },
            });
          } catch (_) {}
        }
      } else if (status === 'denied') {
        // 1. Notify all Guards at Gate
        for (const gid of guardUserIds) {
          try {
            await emitNotification(gid, {
              title: 'Visitor Entry Denied',
              body: `Resident denied entry for ${visitor.visitor_name} (${flatLabel}).${reason ? ` Reason: ${reason}` : ''}`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId || id,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: 'denied',
                reason,
              },
            });
          } catch (_) {}
        }

        // 2. Notify Committee Members & Admins
        for (const aid of adminCommitteeUserIds) {
          try {
            await emitNotification(aid, {
              title: 'Visitor Entry Denied',
              body: `Entry denied for visitor ${visitor.visitor_name} (${flatLabel}).`,
              type: 'info',
              societyId: Number(societyId),
              data: {
                visitorId: visitor.visitorId || id,
                societyId: Number(societyId),
                flatNo: visitor.flat_no,
                type: 'society_visitor',
                status: 'denied',
                reason,
              },
            });
          } catch (_) {}
        }
      } else if (status === 'at_gate') {
        if (hostId && Number(hostId) !== Number(actorUserId)) {
          try {
            await emitNotification(hostId, {
              title: 'Visitor at Gate!',
              body: `${visitor.visitor_name} is waiting at the gate for ${flatLabel}.`,
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
        for (const aid of adminCommitteeUserIds) {
          try {
            await emitNotification(aid, {
              title: 'Visitor at Gate',
              body: `${visitor.visitor_name} has arrived at the gate for ${flatLabel}.`,
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
        for (const adminId of adminCommitteeUserIds) {
          if (Number(adminId) !== Number(actorUserId) && Number(adminId) !== Number(hostId)) {
            try {
              await emitNotification(adminId, {
                title: 'Visitor Checked In',
                body: `${visitor.visitor_name} (${flatLabel}) has checked in at the gate.`,
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
        }
      } else if (status === 'checked_out') {
        // 1. Notify Resident (Host)
        if (hostId && Number(hostId) !== Number(actorUserId)) {
          try {
            await emitNotification(hostId, {
              title: 'Visitor Checked Out',
              body: `Visitor ${visitor.visitor_name} (${flatLabel}) has checked out and departed from the society.`,
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
        for (const adminId of adminCommitteeUserIds) {
          if (Number(adminId) !== Number(actorUserId) && Number(adminId) !== Number(hostId)) {
            try {
              await emitNotification(adminId, {
                title: 'Visitor Checked Out',
                body: `${visitor.visitor_name} (${flatLabel}) has checked out of society campus.`,
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
        }
      }

      // Real-time socket emission
      try {
        const io = getIO();
        if (io) {
          const socketPayload = {
            societyId: Number(societyId),
            visitorId: Number(visitor.visitorId || id),
            visitorName: visitor.visitor_name,
            flatNo: visitor.flat_no,
            status,
            checkInTime: updatePayload.check_in_time,
            checkOutTime: updatePayload.check_out_time,
            updatedBy: Number(actorUserId),
          };
          io.to(`society:${societyId}`).emit(`society:visitor_${status}`, socketPayload);
          io.to(`society:${societyId}`).emit(`society.visitor_${status}`, socketPayload);
          io.to(`society:${societyId}`).emit('society:visitor_status_changed', socketPayload);
          for (const gid of guardUserIds) {
            io.to(`user:${gid}`).emit('society:visitor_status_changed', socketPayload);
          }
          for (const aid of adminCommitteeUserIds) {
            io.to(`user:${aid}`).emit('society:visitor_status_changed', socketPayload);
          }
          if (hostId) {
            io.to(`user:${hostId}`).emit('society:visitor_status_changed', socketPayload);
          }
        }
      } catch (_) {}
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
