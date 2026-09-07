import User from './user.model.js';
import Role from '../role/role.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import { isSuperAdminUser } from '../../middleware/auth.middleware.js';
import { audit } from '../audit_log/audit_log.service.js';
import { invalidateUserPermissionCache } from '../permission/permission.service.js';
import { Op } from 'sequelize';

export const createUser = async (userData) => {
  return await User.create(userData);
};

export const getAllUsers = async () => {
  return await User.findAll({
    where: { is_deleted: false },
    attributes: ['userId', 'userName', 'email', 'phone', 'userRole', 'is_active', 'status'],
    include: [
      { model: UserProfile, as: 'profile', attributes: ['avatarUrl', 'fullName'] }
    ]
  });
};

export const getUserById = async (userId) => {
  return await User.findOne({
    where: { userId, is_deleted: false },
    include: [
      { model: Role, as: 'role' },
      { model: UserProfile, as: 'profile' }
    ]
  });
};

export const updateUser = async (userId, updateData) => {
  const user = await User.findOne({ where: { userId, is_deleted: false } });
  if (!user) return null;
  return await user.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteUser = async (userId, deletedRemarks, updated_by) => {
  const user = await User.findOne({ where: { userId, is_deleted: false } });
  if (!user) return null;
  return await user.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const getUsersByRole = async (roleName) => {
  return await User.findAll({
    where: { is_deleted: false },
    include: [
      {
        model: Role,
        as: 'role',
        where: { roleName: roleName }
      },
      { model: UserProfile, as: 'profile' }
    ]
  });
};

export const blockUser = async (userId) => {
  const user = await User.findOne({ where: { userId, is_deleted: false } });
  if (!user) return null;
  const updated = await user.update({ is_active: false, status: 'blocked', updatedAt: new Date() });
  await invalidateUserPermissionCache(userId);
  return updated;
};

export const unblockUser = async (userId) => {
  const user = await User.findOne({ where: { userId, is_deleted: false } });
  if (!user) return null;
  const updated = await user.update({ is_active: true, status: 'active', updatedAt: new Date() });
  await invalidateUserPermissionCache(userId);
  return updated;
};

export const getPendingVerifications = async () => {
  return await User.findAll({
    where: { is_verified: false, is_deleted: false },
    include: [{ model: Role, as: 'role' }]
  });
};

export const getBlockedUsers = async () => {
  return await User.findAll({
    where: { is_active: false, is_deleted: false },
    include: [{ model: Role, as: 'role' }]
  });
};

export const verifyUser = async (userId) => {
  const user = await User.findOne({ where: { userId, is_deleted: false } });
  if (!user) return null;
  return await user.update({ is_verified: true, status: 'active', updatedAt: new Date() });
};

// Admin User Management (Super Admin Exclusive)
export const listAdminUsers = async () => {
  return await User.findAll({
    where: {
      is_deleted: false,
      userRole: {
        [Op.in]: ['super_admin', 'superadmin', 'admin', 'moderator'],
      },
    },
    attributes: ['userId', 'userName', 'email', 'phone', 'userRole', 'is_active', 'status', 'createdAt', 'updatedAt'],
    include: [
      { model: UserProfile, as: 'profile', attributes: ['avatarUrl', 'fullName'] },
    ],
    order: [['userId', 'ASC']],
  });
};

export const createAdminUser = async (adminData, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isActorSuperAdmin = isSuperAdminUser(actorUser);
  const targetRole = String(adminData.userRole || adminData.role || 'admin').toLowerCase().trim();

  if (['super_admin', 'superadmin'].includes(targetRole) && !isActorSuperAdmin) {
    throw new Error('Forbidden: Only Super Administrators can create Super Admin accounts.');
  }

  const newUser = await User.create({
    ...adminData,
    userRole: targetRole,
    status: 'active',
    is_active: true,
    created_by: actorId,
  });

  await audit({
    actorId,
    action: 'ADMIN_CREATED',
    targetType: 'user',
    targetId: newUser.userId,
    after: { userId: newUser.userId, userRole: newUser.userRole, email: newUser.email },
  });

  return newUser;
};

export const updateAdminUser = async (targetUserId, updateData, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isActorSuperAdmin = isSuperAdminUser(actorUser);

  const targetUser = await User.findOne({ where: { userId: targetUserId, is_deleted: false } });
  if (!targetUser) return null;

  const isTargetSuperAdmin = isSuperAdminUser(targetUser);
  const newRole = updateData.userRole || updateData.role;

  if (!isActorSuperAdmin) {
    if (isTargetSuperAdmin) {
      throw new Error('Forbidden: Only Super Administrators can modify Super Admin accounts.');
    }
    if (newRole && ['super_admin', 'superadmin'].includes(String(newRole).toLowerCase().trim())) {
      throw new Error('Forbidden: Only Super Administrators can grant Super Admin privileges.');
    }
  }

  const before = targetUser.toJSON();
  const updated = await targetUser.update({
    ...updateData,
    ...(newRole ? { userRole: String(newRole).toLowerCase().trim() } : {}),
    updated_by: actorId,
    updatedAt: new Date(),
  });

  await audit({
    actorId,
    action: 'ADMIN_UPDATED',
    targetType: 'user',
    targetId: targetUserId,
    before: { userRole: before.userRole, is_active: before.is_active },
    after: { userRole: updated.userRole, is_active: updated.is_active },
  });

  await invalidateUserPermissionCache(targetUserId);
  return updated;
};

export const deactivateAdminUser = async (targetUserId, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isActorSuperAdmin = isSuperAdminUser(actorUser);

  const targetUser = await User.findOne({ where: { userId: targetUserId, is_deleted: false } });
  if (!targetUser) return null;

  const isTargetSuperAdmin = isSuperAdminUser(targetUser);
  if (isTargetSuperAdmin && !isActorSuperAdmin) {
    throw new Error('Forbidden: Only Super Administrators can deactivate Super Admin accounts.');
  }

  const updated = await targetUser.update({
    is_active: false,
    status: 'inactive',
    updated_by: actorId,
    updatedAt: new Date(),
  });

  await audit({
    actorId,
    action: 'ADMIN_DEACTIVATED',
    targetType: 'user',
    targetId: targetUserId,
  });

  await invalidateUserPermissionCache(targetUserId);
  return updated;
};
