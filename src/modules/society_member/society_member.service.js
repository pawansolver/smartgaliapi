import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyMember from './society_member.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import { createEvent } from '../outbox/outbox.service.js';
import { logSocietyAudit } from '../society_profile/society_audit_log.service.js';
import { invalidateSocietyDetailCache } from '../society_profile/society.cache.js';
import { emitNotification } from '../notification/notification.service.js';

export const createMember = async (societyId, actorUserId, memberData, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    let targetUserId = actorUserId;
    let isStaffOnboarding = ['staff', 'technician', 'provider'].includes(memberData.role);

    // If phone is provided, lookup user by phone
    if (memberData.phone) {
      const cleanPhone = String(memberData.phone).replace(/\D/g, '').slice(-10);
      const user = await User.findOne({
        where: { phone: { [Op.like]: `%${cleanPhone}` } },
        transaction,
      });
      if (!user) {
        const err = new Error(`User with phone number ${memberData.phone} not found. Please ask them to register on SmartGali first.`);
        err.statusCode = 404;
        throw err;
      }
      targetUserId = user.userId;
      isStaffOnboarding = true;
    } else if (memberData.user_id) {
      targetUserId = memberData.user_id;
    }

    const userId = targetUserId;
    const existing = await SocietyMember.findOne({
      where: { society_id: societyId, user_id: userId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    let member;
    if (existing) {
      if (isStaffOnboarding) {
        existing.role = memberData.role || existing.role;
        existing.status = 'active';
        if (memberData.flat_no || memberData.trade) {
          existing.flat_no = memberData.trade || memberData.flat_no || existing.flat_no;
        }
        await existing.save({ transaction });
        await transaction.commit();
        return existing;
      } else {
        existing.role = memberData.role || 'member';
        existing.status = 'pending';
        if (memberData.flat_no) {
          existing.flat_no = memberData.flat_no;
        }
        await existing.save({ transaction });
        member = existing;
      }
    } else {
      member = await SocietyMember.create({
        society_id: societyId,
        user_id: userId,
        flat_no: memberData.flat_no || null,
        role: memberData.role || 'member',
        status: isStaffOnboarding ? 'active' : 'pending',
        joined_at: new Date(),
        created_by: userId,
        created_at: new Date(),
      }, { transaction });
    }

    await logSocietyAudit({
      societyId,
      actorUserId: userId,
      action: 'society.member_joined',
      targetUserId: userId,
      newValue: { role: member.role, flat_no: member.flat_no },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.member_joined',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        userId: Number(userId),
        memberId: Number(member.id),
        role: member.role,
        status: member.status,
      },
    }, { transaction });

    await transaction.commit();

    // Notify Society Admins about new join request
    try {
      const admins = await SocietyMember.findAll({
        where: { society_id: societyId, role: 'admin', status: 'active', is_deleted: false },
      });
      for (const admin of admins) {
        if (Number(admin.user_id) !== Number(userId)) {
          await emitNotification({
            recipientId: admin.user_id,
            actorId: userId,
            type: 'info',
            title: 'New Member Join Request',
            message: `New join request for ${member.flat_no || 'unit'} (${member.role}). Please review and approve.`,
            data: { memberId: Number(member.id), societyId: Number(societyId) },
          });
        }
      }
    } catch (_notifErr) {
      console.error('[CreateMember Notification Error]:', _notifErr);
    }

    return member;
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback().catch(() => {});
    }
    throw error;
  }
};

export const getAllMembers = async (societyId, query = {}) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = { society_id: societyId, is_deleted: false };
  if (query.role) where.role = query.role;
  if (query.status) where.status = query.status;

  const { rows, count } = await SocietyMember.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
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

export const getMemberById = async (id, societyId = null) => {
  const where = { id, is_deleted: false };
  if (societyId) where.society_id = societyId;

  return await SocietyMember.findOne({
    where,
    include: [
      { model: SocietyProfile, as: 'society', attributes: ['id', 'society_name'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const updateMember = async (id, societyId, updateData, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await SocietyMember.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!member) {
      await transaction.commit();
      return null;
    }

    // Last Active Admin Protection
    if (member.role === 'admin' && (updateData.role && updateData.role !== 'admin' || updateData.status && updateData.status !== 'active')) {
      const activeAdminsCount = await SocietyMember.count({
        where: { society_id: societyId, role: 'admin', status: 'active', is_deleted: false },
        transaction,
      });
      if (activeAdminsCount <= 1) {
        const err = new Error('Cannot demote or deactivate the last active admin of this society');
        err.statusCode = 400;
        throw err;
      }
    }

    const oldValue = member.toJSON();
    await member.update({
      ...updateData,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.role_changed',
      targetUserId: member.user_id,
      oldValue,
      newValue: member.toJSON(),
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.role_changed',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        userId: Number(member.user_id),
        newRole: member.role,
        status: member.status,
      },
    }, { transaction });

    await transaction.commit();
    return member;
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback().catch(() => {});
    }
    throw error;
  }
};

export const approveMember = async (id, societyId, { status, remark }, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await SocietyMember.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!member) {
      await transaction.commit();
      return null;
    }

    const oldValue = { status: member.status };
    await member.update({
      status,
      remark: remark || member.remark,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    const eventType = status === 'active' ? 'society.member_approved' : 'society.member_rejected';
    await logSocietyAudit({
      societyId,
      actorUserId,
      action: eventType,
      targetUserId: member.user_id,
      oldValue,
      newValue: { status },
      reason: remark,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: eventType,
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        userId: Number(member.user_id),
        status,
      },
    }, { transaction });

    await transaction.commit();

    // Notify Resident about approval or rejection
    try {
      if (member.user_id && Number(member.user_id) !== Number(actorUserId)) {
        await emitNotification({
          recipientId: member.user_id,
          actorId: actorUserId,
          type: 'info',
          title: status === 'active' ? 'Society Membership Approved! 🎉' : 'Society Membership Rejected',
          message: status === 'active'
            ? `Congratulations! Your membership request for ${member.flat_no || 'your unit'} has been approved.`
            : `Your membership request was rejected: ${remark || 'Please contact society admin.'}`,
          data: { memberId: Number(member.id), societyId: Number(societyId), status },
        });
      }
    } catch (_notifErr) {
      console.error('[ApproveMember Notification Error]:', _notifErr);
    }

    return member;
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback().catch(() => {});
    }
    throw error;
  }
};

export const removeMember = async (id, societyId, deletedRemarks, actorUserId, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const member = await SocietyMember.findOne({
      where: { id, society_id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!member) {
      await transaction.commit();
      return null;
    }

    // Last Active Admin Protection
    if (member.role === 'admin' && member.status === 'active') {
      const activeAdminsCount = await SocietyMember.count({
        where: { society_id: societyId, role: 'admin', status: 'active', is_deleted: false },
        transaction,
      });
      if (activeAdminsCount <= 1) {
        const err = new Error('Cannot remove the last active admin of this society');
        err.statusCode = 400;
        throw err;
      }
    }

    await member.update({
      is_deleted: true,
      deletedRemarks,
      updated_by: actorUserId,
      updatedAt: new Date(),
    }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId,
      action: 'society.member_removed',
      targetUserId: member.user_id,
      reason: deletedRemarks,
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.member_removed',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        userId: Number(member.user_id),
      },
    }, { transaction });

    await transaction.commit();
    return member;
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback().catch(() => {});
    }
    throw error;
  }
};

export const transferSocietyOwnership = async (societyId, { currentOwnerId, targetUserId }, meta = {}) => {
  const transaction = await sequelize.transaction();
  try {
    const society = await SocietyProfile.findOne({
      where: { id: societyId, is_deleted: false },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!society) {
      const err = new Error('Society not found');
      err.statusCode = 404;
      throw err;
    }

    if (Number(society.user_id) !== Number(currentOwnerId)) {
      const err = new Error('Only the current society owner can transfer ownership');
      err.statusCode = 403;
      throw err;
    }

    const targetMembership = await SocietyMember.findOne({
      where: { society_id: societyId, user_id: targetUserId, is_deleted: false, status: 'active' },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!targetMembership) {
      const err = new Error('Target user must be an active member of this society');
      err.statusCode = 400;
      throw err;
    }

    // Update target membership to admin
    await targetMembership.update({ role: 'admin', updatedAt: new Date() }, { transaction });

    // Update Society Owner
    const previousOwnerId = society.user_id;
    await society.update({ user_id: targetUserId, updatedAt: new Date() }, { transaction });

    await logSocietyAudit({
      societyId,
      actorUserId: currentOwnerId,
      action: 'society.ownership_transferred',
      targetUserId,
      oldValue: { ownerId: previousOwnerId },
      newValue: { ownerId: targetUserId },
      requestId: meta.requestId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    }, { transaction });

    await createEvent({
      event_type: 'society.ownership_transferred',
      aggregate_type: 'society',
      aggregate_id: String(societyId),
      payload: {
        societyId: Number(societyId),
        previousOwnerId: Number(previousOwnerId),
        newOwnerId: Number(targetUserId),
      },
    }, { transaction });

    await transaction.commit();
    await invalidateSocietyDetailCache(societyId);

    return society;
  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback().catch(() => {});
    }
    throw error;
  }
};
