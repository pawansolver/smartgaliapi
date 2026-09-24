import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyGuardAuthorization from './society_guard_authorization.model.js';
import SocietyGuardAssignment from './society_guard_assignment.model.js';
import SocietyGate from '../society_gate/society_gate.model.js';
import SocietyShift from '../society_shift/society_shift.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import User from '../user/user.model.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import { createEvent } from '../outbox/outbox.service.js';
import { emitNotification } from '../notification/notification.service.js';
import { invalidateUserPermissionCache, hasPermission } from '../permission/permission.service.js';
import { removeLocalUpload } from '../../utils/fileUpload.js';

/**
 * Sanitizes sensitive verification fields if caller does not possess administrative/verification rights.
 */
export const sanitizeGuardForCaller = async (guard, callerUserId, societyId, isOwnerOrSuperAdmin = false) => {
  if (!guard) return null;
  const raw = guard.toJSON ? guard.toJSON() : { ...guard };
  
  if (isOwnerOrSuperAdmin) return raw;

  // Check if caller has 'guard.verify' permission
  const canVerify = await hasPermission({ userId: callerUserId }, 'guard.verify', { societyId });
  if (canVerify) return raw;

  // Mask sensitive identity details
  if (raw.id_number) {
    const last4 = String(raw.id_number).slice(-4);
    raw.id_number = '•••• •••• ' + last4;
  }
  raw.id_document_url = null; // Unauthorized users cannot see document file link
  return raw;
};

export const onboardGuard = async (societyId, actorUserId, data, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const rawPhone = data.phone || data.mobile;
    if (!rawPhone) {
      const err = new Error('Guard phone number is required');
      err.statusCode = 400;
      throw err;
    }
    const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);

    // 1. Resolve User (Reuse existing user or create one - NO DUPLICATE IDENTITIES)
    let user = await User.findOne({
      where: { phone: { [Op.like]: `%${cleanPhone}` } },
      transaction,
    });

    if (!user) {
      user = await User.create({
        userName: data.name ? data.name.trim() : `Guard ${cleanPhone.slice(-4)}`,
        phone: cleanPhone,
        userRole: 'staff',
        status: 'active',
        is_active: true,
        created_at: new Date(),
      }, { transaction });
    } else if (data.name && (!user.userName || user.userName.startsWith('Guard '))) {
      await user.update({ userName: data.name.trim() }, { transaction });
    }

    // 2. Ensure Society Member record with role 'staff'
    let socMember = await SocietyMember.findOne({
      where: { society_id: societyId, user_id: user.userId, is_deleted: false },
      transaction,
    });
    if (!socMember) {
      socMember = await SocietyMember.create({
        society_id: societyId,
        user_id: user.userId,
        role: 'staff',
        status: 'active',
        joined_at: new Date(),
        created_by: actorUserId,
        created_at: new Date(),
      }, { transaction });
    } else if (socMember.status !== 'active') {
      await socMember.update({ status: 'active', role: 'staff' }, { transaction });
    }

    // 3. Create or update SocietyGuardAuthorization
    let guardAuth = await SocietyGuardAuthorization.findOne({
      where: { society_id: societyId, user_id: user.userId, is_deleted: false },
      transaction,
    });

    // Verification status rules:
    // If id_document_url provided, pending verification. If explicitly passed, use it, else 'unverified'
    let initialVerification = data.verification_status || 'unverified';
    if (data.id_document_url && (!data.verification_status || data.verification_status === 'unverified')) {
      initialVerification = 'pending';
    }

    const authPayload = {
      designation: data.designation || 'Security Guard',
      guard_type: data.guard_type || 'society_guard',
      employee_id: data.employee_id || null,
      badge_number: data.badge_number || null,
      agency_name: data.agency_name || null,
      alternate_phone: data.alternate_phone || null,
      gender: data.gender || null,
      dob: data.dob || null,
      profile_photo_url: data.profile_photo_url || null,
      id_type: data.id_type || 'aadhaar',
      id_number: data.id_number || null,
      id_document_url: data.id_document_url || null,
      verification_status: initialVerification,
      police_verification_status: data.police_verification_status || 'not_submitted',
      joining_date: data.joining_date || new Date(),
      contract_start_date: data.contract_start_date || null,
      contract_end_date: data.contract_end_date || null,
      status: 'active',
      notes: data.notes || null,
      updated_by: actorUserId,
      updated_at: new Date(),
    };

    if (guardAuth) {
      await guardAuth.update(authPayload, { transaction });
    } else {
      guardAuth = await SocietyGuardAuthorization.create({
        society_id: societyId,
        user_id: user.userId,
        ...authPayload,
        created_by: actorUserId,
        created_at: new Date(),
      }, { transaction });
    }

    // 4. Gate and Shift Assignment if provided
    let gateId = data.gate_id;
    let shiftId = data.shift_id;

    if (!gateId && data.gate_name) {
      const g = await SocietyGate.findOne({
        where: { society_id: societyId, gate_name: data.gate_name.trim(), is_deleted: false },
        transaction,
      });
      if (g) gateId = g.id;
    }
    if (!shiftId && data.shift_name) {
      const s = await SocietyShift.findOne({
        where: { society_id: societyId, shift_name: data.shift_name.trim(), is_deleted: false },
        transaction,
      });
      if (s) shiftId = s.id;
    }

    if (!gateId) {
      const defaultGate = await SocietyGate.findOne({
        where: { society_id: societyId, is_deleted: false, status: 'active' },
        transaction,
      });
      if (defaultGate) gateId = defaultGate.id;
    }
    if (!shiftId) {
      const defaultShift = await SocietyShift.findOne({
        where: { society_id: societyId, is_deleted: false, status: 'active' },
        transaction,
      });
      if (defaultShift) shiftId = defaultShift.id;
    }

    if (gateId && shiftId) {
      // Deactivate old active assignments for this guard
      await SocietyGuardAssignment.update(
        { status: 'completed', updated_by: actorUserId, updated_at: new Date() },
        { where: { guard_authorization_id: guardAuth.id, status: 'active' }, transaction }
      );

      await SocietyGuardAssignment.create({
        society_id: societyId,
        guard_authorization_id: guardAuth.id,
        user_id: user.userId,
        gate_id: gateId,
        shift_id: shiftId,
        assignment_type: data.assignment_type || 'permanent',
        start_date: data.start_date || new Date(),
        status: 'active',
        remarks: data.remarks || 'Onboarded assignment',
        created_by: actorUserId,
        created_at: new Date(),
        updated_at: new Date(),
      }, { transaction });
    }

    await invalidateUserPermissionCache(user.userId);

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.guard_onboarded',
      targetUserId: user.userId,
      targetEntityType: 'guard',
      targetEntityId: guardAuth.id,
      newValue: { designation: guardAuth.designation, gateId, shiftId, verification_status: initialVerification },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.guard_onboarded',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId,
        guardAuthId: guardAuth.id,
        userId: user.userId,
        name: user.userName,
        gateId,
        shiftId,
      },
    }, { transaction });

    await transaction.commit();

    try {
      await emitNotification(user.userId, {
        title: 'Security Desk Access Granted',
        body: `You have been authorized as a security guard for this society. Gate duty active.`,
        type: 'society_guard',
        societyId,
      });
    } catch (_) {}

    return getGuardById(guardAuth.id, societyId, actorUserId, true);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getGuards = async (societyId, query = {}, callerUserId = null, isOwnerOrSuperAdmin = false) => {
  const where = { society_id: societyId, is_deleted: false };
  if (query.status) where.status = query.status;
  if (query.guard_type) where.guard_type = query.guard_type;
  if (query.verification_status) where.verification_status = query.verification_status;

  const guards = await SocietyGuardAuthorization.findAll({
    where,
    order: [['created_at', 'DESC']],
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'phone', 'email'] },
      {
        model: SocietyGuardAssignment,
        as: 'assignments',
        where: { status: 'active', is_deleted: false },
        required: false,
        include: [
          { model: SocietyGate, as: 'gate', attributes: ['id', 'gate_name', 'gate_code'] },
          { model: SocietyShift, as: 'shift', attributes: ['id', 'shift_name', 'start_time', 'end_time'] },
        ],
      },
    ],
  });

  const sanitized = [];
  for (const g of guards) {
    sanitized.push(await sanitizeGuardForCaller(g, callerUserId, societyId, isOwnerOrSuperAdmin));
  }
  return sanitized;
};

export const getGuardById = async (id, societyId, callerUserId = null, isOwnerOrSuperAdmin = false) => {
  const guard = await SocietyGuardAuthorization.findOne({
    where: { id, society_id: societyId, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'phone', 'email'] },
      {
        model: SocietyGuardAssignment,
        as: 'assignments',
        where: { is_deleted: false },
        required: false,
        include: [
          { model: SocietyGate, as: 'gate' },
          { model: SocietyShift, as: 'shift' },
        ],
      },
    ],
  });

  if (!guard) return null;
  return sanitizeGuardForCaller(guard, callerUserId, societyId, isOwnerOrSuperAdmin);
};

export const updateGuardPhoto = async (id, societyId, photoUrl, actorUserId, meta = {}) => {
  const guardAuth = await SocietyGuardAuthorization.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!guardAuth) return null;

  const oldPhoto = guardAuth.profile_photo_url;
  await guardAuth.update({
    profile_photo_url: photoUrl,
    updated_by: actorUserId,
    updated_at: new Date(),
  });

  if (oldPhoto && oldPhoto !== photoUrl) {
    await removeLocalUpload(oldPhoto).catch(() => {});
  }

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'society.guard_photo_updated',
    targetUserId: guardAuth.user_id,
    targetEntityType: 'guard',
    targetEntityId: id,
    newValue: { profile_photo_url: photoUrl },
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return getGuardById(id, societyId, actorUserId, true);
};

export const removeGuardPhoto = async (id, societyId, actorUserId, meta = {}) => {
  const guardAuth = await SocietyGuardAuthorization.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!guardAuth) return null;

  const oldPhoto = guardAuth.profile_photo_url;
  await guardAuth.update({
    profile_photo_url: null,
    updated_by: actorUserId,
    updated_at: new Date(),
  });

  if (oldPhoto) {
    await removeLocalUpload(oldPhoto).catch(() => {});
  }

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'society.guard_photo_removed',
    targetUserId: guardAuth.user_id,
    targetEntityType: 'guard',
    targetEntityId: id,
    requestId: meta.requestId,
  });

  return getGuardById(id, societyId, actorUserId, true);
};

export const uploadGuardIdDocument = async (id, societyId, { idType, idNumber, documentUrl }, actorUserId, meta = {}) => {
  const guardAuth = await SocietyGuardAuthorization.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!guardAuth) return null;

  const updateFields = {
    verification_status: 'pending',
    updated_by: actorUserId,
    updated_at: new Date(),
  };
  if (idType) updateFields.id_type = idType;
  if (idNumber) updateFields.id_number = idNumber;
  if (documentUrl) updateFields.id_document_url = documentUrl;

  await guardAuth.update(updateFields);

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'guard.verification_submitted',
    targetUserId: guardAuth.user_id,
    targetEntityType: 'guard',
    targetEntityId: id,
    newValue: { id_type: idType || guardAuth.id_type, verification_status: 'pending' },
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return getGuardById(id, societyId, actorUserId, true);
};

export const verifyGuard = async (id, societyId, actorUserId, meta = {}) => {
  const guardAuth = await SocietyGuardAuthorization.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!guardAuth) return null;

  await guardAuth.update({
    verification_status: 'verified',
    verification_date: new Date(),
    verified_by: actorUserId,
    rejection_reason: null,
    updated_by: actorUserId,
    updated_at: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'guard.verification_approved',
    targetUserId: guardAuth.user_id,
    targetEntityType: 'guard',
    targetEntityId: id,
    newValue: { verification_status: 'verified', verified_by: actorUserId },
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  try {
    await emitNotification(guardAuth.user_id, {
      title: 'Identity Verification Approved',
      body: 'Your identity document verification has been successfully approved by the society administrator.',
      type: 'society_guard',
      societyId,
    });
  } catch (_) {}

  return getGuardById(id, societyId, actorUserId, true);
};

export const rejectGuardVerification = async (id, societyId, reason, actorUserId, meta = {}) => {
  const guardAuth = await SocietyGuardAuthorization.findOne({
    where: { id, society_id: societyId, is_deleted: false },
  });
  if (!guardAuth) return null;

  await guardAuth.update({
    verification_status: 'rejected',
    rejection_reason: reason || 'Document does not match security guidelines',
    verification_date: new Date(),
    verified_by: actorUserId,
    updated_by: actorUserId,
    updated_at: new Date(),
  });

  await logSocietyAudit({
    societyId,
    actorUserId,
    action: 'guard.verification_rejected',
    targetUserId: guardAuth.user_id,
    targetEntityType: 'guard',
    targetEntityId: id,
    newValue: { verification_status: 'rejected', reason },
    requestId: meta.requestId,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  try {
    await emitNotification(guardAuth.user_id, {
      title: 'Identity Verification Rejected',
      body: `Your identity verification was rejected: ${reason || 'Please submit a clear document'}.`,
      type: 'society_guard',
      societyId,
    });
  } catch (_) {}

  return getGuardById(id, societyId, actorUserId, true);
};

export const updateGuardStatus = async (id, societyId, { status, notes }, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const guardAuth = await SocietyGuardAuthorization.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!guardAuth) {
      await transaction.commit();
      return null;
    }

    const oldValue = guardAuth.toJSON();
    await guardAuth.update({
      status,
      notes: notes || guardAuth.notes,
      updated_by: actorUserId,
      updated_at: new Date(),
    }, { transaction });

    // If non-active, complete active assignments
    if (status !== 'active') {
      await SocietyGuardAssignment.update(
        { status: 'cancelled', updated_by: actorUserId, updated_at: new Date() },
        { where: { guard_authorization_id: id, status: 'active' }, transaction }
      );
    }

    await invalidateUserPermissionCache(guardAuth.user_id);

    const auditAction = status === 'active' ? 'society.guard_activated' : 'society.guard_deactivated';

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: auditAction,
      targetUserId: guardAuth.user_id,
      targetEntityType: 'guard',
      targetEntityId: id,
      oldValue: { status: oldValue.status },
      newValue: { status },
      reason: notes,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return getGuardById(id, societyId, actorUserId, true);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const assignGuardGateAndShift = async (societyId, actorUserId, data, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const guardAuth = await SocietyGuardAuthorization.findOne({
      where: { id: data.guard_authorization_id, society_id: societyId, is_deleted: false },
      transaction,
    });
    if (!guardAuth) {
      const err = new Error('Guard authorization record not found');
      err.statusCode = 404;
      throw err;
    }
    if (guardAuth.status !== 'active') {
      const err = new Error('Cannot assign inactive or revoked guard to duty');
      err.statusCode = 400;
      throw err;
    }

    // Verify gate
    const gate = await SocietyGate.findOne({
      where: { id: data.gate_id, society_id: societyId, is_deleted: false, status: 'active' },
      transaction,
    });
    if (!gate) {
      const err = new Error('Active gate not found in this society');
      err.statusCode = 404;
      throw err;
    }

    // Verify shift
    const shift = await SocietyShift.findOne({
      where: { id: data.shift_id, society_id: societyId, is_deleted: false, status: 'active' },
      transaction,
    });
    if (!shift) {
      const err = new Error('Active shift not found in this society');
      err.statusCode = 404;
      throw err;
    }

    // Check if reassigning from existing active assignment
    const previousActive = await SocietyGuardAssignment.findOne({
      where: { guard_authorization_id: guardAuth.id, status: 'active' },
      transaction,
    });

    // Deactivate existing active assignment
    await SocietyGuardAssignment.update(
      { status: 'completed', updated_by: actorUserId, updated_at: new Date() },
      { where: { guard_authorization_id: guardAuth.id, status: 'active' }, transaction }
    );

    const assignment = await SocietyGuardAssignment.create({
      society_id: societyId,
      guard_authorization_id: guardAuth.id,
      user_id: guardAuth.user_id,
      gate_id: data.gate_id,
      shift_id: data.shift_id,
      assignment_type: data.assignment_type || 'permanent',
      start_date: data.start_date || new Date(),
      end_date: data.end_date || null,
      status: 'active',
      remarks: data.remarks || null,
      created_by: actorUserId,
      created_at: new Date(),
      updated_at: new Date(),
    }, { transaction });

    const auditAction = previousActive ? 'society.guard_reassigned' : 'society.guard_assigned';

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: auditAction,
      targetUserId: guardAuth.user_id,
      targetEntityType: 'guard_assignment',
      targetEntityId: assignment.id,
      oldValue: previousActive ? { gateId: previousActive.gate_id, shiftId: previousActive.shift_id } : null,
      newValue: { gateId: data.gate_id, shiftId: data.shift_id },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();

    try {
      await emitNotification(guardAuth.user_id, {
        title: previousActive ? 'Duty Reassigned' : 'Gate Assignment Assigned',
        body: `You have been assigned to ${gate.gate_name} for ${shift.shift_name}.`,
        type: 'society_guard',
        societyId,
      });
    } catch (_) {}

    return assignment;
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw error;
  }
};

export const getMyGuardDuty = async (userId, societyId) => {
  const guardAuth = await SocietyGuardAuthorization.findOne({
    where: { user_id: userId, society_id: societyId, is_deleted: false },
    include: [
      {
        model: SocietyGuardAssignment,
        as: 'assignments',
        where: { status: 'active', is_deleted: false },
        required: false,
        include: [
          { model: SocietyGate, as: 'gate' },
          { model: SocietyShift, as: 'shift' },
        ],
      },
    ],
  });

  if (!guardAuth) return null;

  const currentAssignment = guardAuth.assignments?.[0] || null;
  const isAuthActive = guardAuth.status === 'active';
  const hasActiveAssignment = currentAssignment !== null && currentAssignment.status === 'active';
  const isOnDuty = isAuthActive && hasActiveAssignment;

  return {
    authorization: guardAuth,
    isActive: isAuthActive,
    isOnDuty: isOnDuty,
    gate: isOnDuty ? currentAssignment?.gate : null,
    shift: isOnDuty ? currentAssignment?.shift : null,
    assignment: isOnDuty ? currentAssignment : null,
  };
};

export const updateGuard = async (id, societyId, data, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const guardAuth = await SocietyGuardAuthorization.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!guardAuth) {
      await transaction.commit();
      return null;
    }

    const oldValue = guardAuth.toJSON();
    const updateData = {};
    if (data.designation !== undefined) updateData.designation = data.designation;
    if (data.guardType !== undefined) updateData.guard_type = data.guardType;
    if (data.guard_type !== undefined) updateData.guard_type = data.guard_type;
    if (data.employeeId !== undefined) updateData.employee_id = data.employeeId;
    if (data.employee_id !== undefined) updateData.employee_id = data.employee_id;
    if (data.badgeNumber !== undefined) updateData.badge_number = data.badgeNumber;
    if (data.agencyName !== undefined) updateData.agency_name = data.agencyName;
    if (data.agency_name !== undefined) updateData.agency_name = data.agency_name;
    if (data.idType !== undefined) updateData.id_type = data.idType;
    if (data.id_type !== undefined) updateData.id_type = data.id_type;
    if (data.idNumber !== undefined) updateData.id_number = data.idNumber;
    if (data.id_number !== undefined) updateData.id_number = data.id_number;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.status !== undefined) updateData.status = data.status;

    updateData.updated_by = actorUserId;
    updateData.updated_at = new Date();

    await guardAuth.update(updateData, { transaction });

    // Update User profile details if provided
    const user = await User.findByPk(guardAuth.user_id, { transaction });
    if (user) {
      const userUpdate = {};
      if (data.name !== undefined && data.name.trim()) userUpdate.name = data.name.trim();
      if (data.gender !== undefined) userUpdate.gender = data.gender;
      if (data.dob !== undefined) userUpdate.dob = data.dob;
      if (data.alternatePhone !== undefined) userUpdate.alternate_phone = data.alternatePhone;
      if (data.alternate_phone !== undefined) userUpdate.alternate_phone = data.alternate_phone;
      if (Object.keys(userUpdate).length > 0) {
        await user.update(userUpdate, { transaction });
      }
    }

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.guard_updated',
      targetUserId: guardAuth.user_id,
      targetEntityType: 'guard',
      targetEntityId: id,
      oldValue,
      newValue: guardAuth.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return getGuardById(id, societyId, actorUserId, true);
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw err;
  }
};

export const deleteGuard = async (id, societyId, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const guardAuth = await SocietyGuardAuthorization.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!guardAuth) {
      await transaction.commit();
      return false;
    }

    await guardAuth.update({
      is_deleted: true,
      status: 'revoked',
      updated_by: actorUserId,
      updated_at: new Date(),
    }, { transaction });

    await SocietyGuardAssignment.update(
      { status: 'cancelled', updated_by: actorUserId, updated_at: new Date() },
      { where: { guard_authorization_id: id, status: 'active' }, transaction }
    );

    await invalidateUserPermissionCache(guardAuth.user_id);

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.guard_deleted',
      targetUserId: guardAuth.user_id,
      targetEntityType: 'guard',
      targetEntityId: id,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await transaction.commit();
    return true;
  } catch (err) {
    if (transaction && !transaction.finished) await transaction.rollback().catch(() => {});
    throw err;
  }
};
