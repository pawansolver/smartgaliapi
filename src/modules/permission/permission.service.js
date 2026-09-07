import Permission from './permission.model.js';
import RolePermission from './role_permission.model.js';
import UserPermission from './user_permission.model.js';
import UserRole from './user_role.model.js';
import Role from '../role/role.model.js';
import User from '../user/user.model.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import Community from '../community/community.model.js';
import SocietyMember from '../society_member/society_member.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import { audit } from '../audit_log/audit_log.service.js';
import { isSuperAdminUser, isGlobalAdminUser } from '../../middleware/auth.middleware.js';
import { cacheGet, cacheSet, cacheDel } from '../../config/redis.js';
import { errorResponse } from '../../utils/response.js';
import { logger } from '../../utils/logger.js';
import { Op } from 'sequelize';

// Tier-1 In-Memory Permission Cache with TTL
const l1Cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const REDIS_CACHE_TTL_SEC = 300; // 5 minutes

export const getRedisCacheKey = (userId) => `permissions:user:${userId}`;

export const invalidateUserPermissionCache = async (userId) => {
  if (!userId) return;
  const keyStr = String(userId);
  l1Cache.delete(keyStr);
  try {
    await cacheDel(getRedisCacheKey(userId));
  } catch (err) {
    logger.warn('PBAC', `Redis cacheDel failed for user ${userId}: ${err.message}`);
  }
  logger.info('PBAC', `Invalidated permission cache for user ${userId}`);
};

export const invalidateAllPermissionCaches = async () => {
  l1Cache.clear();
  logger.info('PBAC', 'Invalidated all local permission caches');
};

/**
 * Reconstructs a Permission object from serialized payload
 */
const deserializePermissions = (data) => {
  return {
    userId: data.userId,
    permissions: new Set(data.permissions || []),
    directAllows: new Set(data.directAllows || []),
    directDenies: new Set(data.directDenies || []),
    roles: data.roles || [],
    isSuperAdmin: !!data.isSuperAdmin,
    isGlobalAdmin: !!data.isGlobalAdmin,
  };
};

/**
 * Resolve effective permissions for a user (or userId).
 * Uses multi-tier caching: L1 Process Cache -> L2 Redis Distributed Cache -> Database.
 */
export const getUserEffectivePermissions = async (userOrId, { forceRefresh = false } = {}) => {
  if (!userOrId) {
    return {
      userId: null,
      permissions: new Set(),
      directAllows: new Set(),
      directDenies: new Set(),
      roles: [],
      isSuperAdmin: false,
      isGlobalAdmin: false,
    };
  }

  const userId = typeof userOrId === 'object' ? (userOrId.id || userOrId.userId) : userOrId;
  const userObj = typeof userOrId === 'object' ? userOrId : null;
  const cacheKey = String(userId || 'anon');
  const now = Date.now();

  // 1. Check Tier-1 Process Cache (Fast path)
  if (!forceRefresh && userId && !userObj?.userRole && l1Cache.has(cacheKey)) {
    const cached = l1Cache.get(cacheKey);
    if (cached.expiresAt > now) {
      return cached.data;
    }
    l1Cache.delete(cacheKey);
  }

  // 2. Check Tier-2 Redis Distributed Cache
  if (!forceRefresh && userId && !userObj?.userRole) {
    try {
      const redisData = await cacheGet(getRedisCacheKey(userId));
      if (redisData) {
        const deserialized = deserializePermissions(redisData);
        l1Cache.set(cacheKey, {
          data: deserialized,
          expiresAt: now + CACHE_TTL_MS,
        });
        return deserialized;
      }
    } catch (err) {
      logger.warn('PBAC', `Redis cache read failed for user ${userId}: ${err.message}`);
    }
  }

  try {
    let dbUser = null;
    if (userId) {
      dbUser = await User.findOne({
        where: {
          userId,
          is_deleted: false,
          is_active: true,
        },
        attributes: ['userId', 'userName', 'email', 'userRole', 'status', 'is_active', 'is_deleted'],
      });
    }

    const isSuperAdmin = isSuperAdminUser(userObj) || isSuperAdminUser(dbUser);
    const isGlobalAdmin = isGlobalAdminUser(userObj) || isGlobalAdminUser(dbUser);
    const effectiveUser = userObj || dbUser;

    if (!effectiveUser || (effectiveUser.status && effectiveUser.status !== 'active')) {
      return {
        userId,
        permissions: new Set(),
        directAllows: new Set(),
        directDenies: new Set(),
        roles: [],
        isSuperAdmin: false,
        isGlobalAdmin: false,
      };
    }

    const directAllows = new Set();
    const directDenies = new Set();

    if (userId && dbUser) {
      const directPermRecords = await UserPermission.findAll({
        where: { user_id: userId },
        include: [{
          model: Permission,
          as: 'permission',
          where: { is_active: true, is_deleted: false },
          attributes: ['permission_code'],
        }],
      });

      for (const record of directPermRecords) {
        const code = record.permission?.permission_code;
        if (!code) continue;
        if (record.effect === 'DENY') {
          directDenies.add(code);
        } else if (record.effect === 'ALLOW') {
          directAllows.add(code);
        }
      }
    }

    const roleCodes = new Set();
    const roleIds = new Set();

    if (userId && dbUser) {
      const userRoleRecords = await UserRole.findAll({
        where: { user_id: userId },
        include: [{
          model: Role,
          as: 'role',
          where: { is_deleted: false, is_active: true },
          attributes: ['roleId', 'role_code', 'roleName'],
        }],
      });

      for (const ur of userRoleRecords) {
        if (ur.role) {
          if (ur.role.role_code) roleCodes.add(ur.role.role_code);
          if (ur.role.roleName) roleCodes.add(ur.role.roleName);
          roleIds.add(ur.role.roleId);
        }
      }
    }

    if (effectiveUser.userRole) {
      roleCodes.add(effectiveUser.userRole);
      roleCodes.add(effectiveUser.userRole.toUpperCase());
    }
    if (effectiveUser.role) {
      roleCodes.add(effectiveUser.role);
      roleCodes.add(effectiveUser.role.toUpperCase());
    }

    // Resolve matching roles from database if only roleCodes are known
    if (roleIds.size === 0 && roleCodes.size > 0) {
      const matchedRoles = await Role.findAll({
        where: {
          [Op.or]: [
            { role_code: { [Op.in]: Array.from(roleCodes) } },
            { roleName: { [Op.in]: Array.from(roleCodes) } },
          ],
          is_deleted: false,
          is_active: true,
        },
        attributes: ['roleId', 'role_code', 'roleName'],
      });
      for (const r of matchedRoles) {
        roleIds.add(r.roleId);
        if (r.role_code) roleCodes.add(r.role_code);
      }
    }

    const inheritedPermCodes = new Set();

    if (roleIds.size > 0) {
      const rolePermRecords = await RolePermission.findAll({
        where: { role_id: { [Op.in]: Array.from(roleIds) } },
        include: [{
          model: Permission,
          as: 'permission',
          where: { is_active: true, is_deleted: false },
          attributes: ['permission_code'],
        }],
      });

      for (const rp of rolePermRecords) {
        const code = rp.permission?.permission_code;
        if (code) {
          inheritedPermCodes.add(code);
        }
      }
    }

    const effectivePermissions = new Set();

    if (isSuperAdmin) {
      const allActivePerms = await Permission.findAll({
        where: { is_active: true, is_deleted: false },
        attributes: ['permission_code'],
      });
      for (const p of allActivePerms) {
        if (!directDenies.has(p.permission_code)) {
          effectivePermissions.add(p.permission_code);
        }
      }
    } else {
      for (const code of inheritedPermCodes) {
        if (!directDenies.has(code)) {
          effectivePermissions.add(code);
        }
      }

      for (const code of directAllows) {
        if (!directDenies.has(code)) {
          effectivePermissions.add(code);
        }
      }
    }

    const result = {
      userId,
      permissions: effectivePermissions,
      directAllows,
      directDenies,
      roles: Array.from(roleCodes),
      isSuperAdmin,
      isGlobalAdmin,
    };

    if (userId) {
      // Save to L1 memory cache
      l1Cache.set(cacheKey, {
        data: result,
        expiresAt: now + CACHE_TTL_MS,
      });

      // Save to L2 Redis distributed cache
      const serialized = {
        userId,
        permissions: Array.from(effectivePermissions),
        directAllows: Array.from(directAllows),
        directDenies: Array.from(directDenies),
        roles: Array.from(roleCodes),
        isSuperAdmin,
        isGlobalAdmin,
      };
      cacheSet(getRedisCacheKey(userId), serialized, REDIS_CACHE_TTL_SEC).catch((err) => {
        logger.warn('PBAC', `Failed to write Redis cache for user ${userId}: ${err.message}`);
      });
    }

    return result;
  } catch (error) {
    logger.error('PBAC', `Failed to resolve permissions for user ${userId}: ${error.message}`, error);
    return {
      userId,
      permissions: new Set(),
      directAllows: new Set(),
      directDenies: new Set(),
      roles: [],
      isSuperAdmin: false,
      isGlobalAdmin: false,
    };
  }
};

/**
 * Evaluates authorization for user, permission code, and context.
 * Strict Evaluation Order:
 * 1. Direct DENY check (takes absolute precedence)
 * 2. Resource Ownership
 * 3. Scoped Authority (Community / Society)
 * 4. Super Admin platform bypass (if not directly denied)
 * 5. Platform permission matrix
 */
export const hasPermission = async (user, permissionCode, context = {}) => {
  if (!user || (!user.id && !user.userId)) {
    return false;
  }

  const userId = user.id || user.userId;
  if (!permissionCode) {
    return false;
  }

  try {
    const effective = await getUserEffectivePermissions(user);

    // 1. Direct DENY check takes absolute precedence (fail-closed)
    if (effective.directDenies.has(permissionCode)) {
      return false;
    }

    const hasPlatformPerm = effective.permissions.has(permissionCode);

    // 2. Resource Ownership Check
    if (context.resourceOwnerId !== undefined && context.resourceOwnerId !== null) {
      const isOwner = String(userId) === String(context.resourceOwnerId);

      if (isOwner) {
        if (hasPlatformPerm) return true;
        const ownPerm = permissionCode.includes('_own') ? permissionCode : (permissionCode + '_own');
        if (effective.permissions.has(ownPerm)) return true;
        const prefix = permissionCode.split('.')[0];
        if (effective.permissions.has(prefix + '.create') || effective.permissions.has(prefix + '.update_own')) {
          return true;
        }
      } else {
        if (permissionCode.endsWith('_own')) {
          const anyPerm = permissionCode.replace('_own', '_any');
          if (effective.permissions.has(anyPerm)) return true;
          if (effective.isSuperAdmin) return true;
          return false;
        }
      }
    }

    // 3. Community Scope Check (IDOR & Community Role Validation)
    if (context.communityId) {
      if (effective.isSuperAdmin) return true;

      const membership = await CommunityMember.findOne({
        where: {
          community_id: context.communityId,
          user_id: userId,
          is_deleted: false,
          status: 'active',
        },
      });

      if (context.requireCommunityMembership && !membership) {
        return false;
      }

      if (membership) {
        const cRole = String(membership.role || '').toLowerCase();
        if (cRole === 'owner' || cRole === 'admin') {
          const allowedCommunityAdminPerms = [
            'community.view', 'community.update', 'community.manage_members',
            'community.member.approve', 'community.member.remove', 'community.member.ban', 'community.member.unban',
            'community.announcement.create', 'community.announcement.delete',
            'community.document.upload', 'community.document.delete',
            'community.media.upload', 'community.media.delete',
            'poll.create', 'poll.delete_any', 'poll.vote',
            'post.pin', 'post.delete_any', 'post.create', 'post.view',
            'event.create', 'event.view', 'event.update_own', 'event.delete_own', 'event.delete_any', 'event.cancel',
            'event.view_participants', 'event.rsvp',
          ];
          if (allowedCommunityAdminPerms.includes(permissionCode)) {
            return true;
          }
        } else if (cRole === 'moderator') {
          const allowedCommunityModPerms = [
            'community.view', 'community.member.approve', 'post.pin', 'post.delete_any',
            'poll.create', 'poll.delete_any', 'poll.vote',
            'event.view', 'event.view_participants', 'event.rsvp',
          ];
          if (allowedCommunityModPerms.includes(permissionCode)) {
            return true;
          }
        } else if (cRole === 'member') {
          const allowedCommunityMemberPerms = [
            'community.view', 'post.create', 'post.view', 'post.update_own', 'post.delete_own',
            'poll.create', 'poll.view', 'poll.update_own', 'poll.delete_own', 'poll.vote',
            'event.create', 'event.view', 'event.update_own', 'event.delete_own', 'event.rsvp',
          ];
          if (allowedCommunityMemberPerms.includes(permissionCode) && hasPlatformPerm) {
            return true;
          }
        }
      }
    }

    // 4. Society Scope Check (IDOR & Society Role Validation)
    if (context.societyId) {
      if (effective.isSuperAdmin) return true;

      const societyMember = await SocietyMember.findOne({
        where: {
          society_id: context.societyId,
          user_id: userId,
          is_deleted: false,
          status: 'active',
        },
      });

      if (societyMember) {
        const sRole = String(societyMember.role || '').toLowerCase();
        if (sRole === 'admin' || sRole === 'committee') {
          const allowedSocietyAdminPerms = [
            'society.view', 'society.update', 'society.manage_members',
            'society.parking.manage', 'society.complaint.create', 'society.complaint.resolve',
            'society.visitor.manage', 'society.notice.publish',
            'poll.create', 'poll.vote', 'event.create', 'event.rsvp',
          ];
          if (allowedSocietyAdminPerms.includes(permissionCode)) {
            return true;
          }
        } else if (sRole === 'resident' || sRole === 'member') {
          const allowedSocietyResidentPerms = [
            'society.view', 'society.complaint.create', 'poll.create', 'poll.vote', 'event.create', 'event.rsvp',
          ];
          if (allowedSocietyResidentPerms.includes(permissionCode) && hasPlatformPerm) {
            return true;
          }
        }
      }
    }

    return hasPlatformPerm;
  } catch (err) {
    logger.error('PBAC', 'hasPermission error: ' + err.message, err);
    return false;
  }
};

export const authorize = async (user, permissionCode, context = {}) => {
  const allowed = await hasPermission(user, permissionCode, context);
  return {
    allowed,
    permission: permissionCode,
    reason: allowed ? 'Access granted' : 'Insufficient permissions or invalid resource scope',
  };
};

export const requirePermission = (permissionCode, contextExtractor = null) => {
  return async (req, res, next) => {
    try {
      if (!req.user || (!req.user.id && !req.user.userId)) {
        return errorResponse(res, 401, 'Authentication required.');
      }

      let context = {};
      if (typeof contextExtractor === 'function') {
        context = await contextExtractor(req);
      } else if (contextExtractor && typeof contextExtractor === 'object') {
        context = { ...contextExtractor };
      }

      const allowed = await hasPermission(req.user, permissionCode, context);
      if (!allowed) {
        return errorResponse(res, 403, `Forbidden: '${permissionCode}' permission required.`);
      }

      return next();
    } catch (error) {
      logger.error('PBAC', 'requirePermission middleware error: ' + error.message, error);
      return errorResponse(res, 403, 'Authorization failed.');
    }
  };
};

export const requireAnyPermission = (permissionCodes = [], contextExtractor = null) => {
  return async (req, res, next) => {
    try {
      if (!req.user || (!req.user.id && !req.user.userId)) {
        return errorResponse(res, 401, 'Authentication required.');
      }

      let context = {};
      if (typeof contextExtractor === 'function') {
        context = await contextExtractor(req);
      } else if (contextExtractor && typeof contextExtractor === 'object') {
        context = { ...contextExtractor };
      }

      for (const code of permissionCodes) {
        const allowed = await hasPermission(req.user, code, context);
        if (allowed) return next();
      }

      return errorResponse(res, 403, 'Forbidden: Insufficient privileges.');
    } catch (error) {
      logger.error('PBAC', 'requireAnyPermission middleware error: ' + error.message, error);
      return errorResponse(res, 403, 'Authorization failed.');
    }
  };
};

export const requireAllPermissions = (permissionCodes = [], contextExtractor = null) => {
  return async (req, res, next) => {
    try {
      if (!req.user || (!req.user.id && !req.user.userId)) {
        return errorResponse(res, 401, 'Authentication required.');
      }

      let context = {};
      if (typeof contextExtractor === 'function') {
        context = await contextExtractor(req);
      } else if (contextExtractor && typeof contextExtractor === 'object') {
        context = { ...contextExtractor };
      }

      for (const code of permissionCodes) {
        const allowed = await hasPermission(req.user, code, context);
        if (!allowed) {
          return errorResponse(res, 403, `Forbidden: '${code}' permission required.`);
        }
      }

      return next();
    } catch (error) {
      logger.error('PBAC', 'requireAllPermissions middleware error: ' + error.message, error);
      return errorResponse(res, 403, 'Authorization failed.');
    }
  };
};

// CRUD for Permissions Registry
export const getAllPermissions = async (query = {}) => {
  const where = { is_deleted: false };
  if (query.module) where.module = query.module;
  if (query.is_active !== undefined) where.is_active = query.is_active === 'true' || query.is_active === true;
  if (query.search) {
    where[Op.or] = [
      { permission_code: { [Op.like]: `%${query.search}%` } },
      { permission_name: { [Op.like]: `%${query.search}%` } },
      { description: { [Op.like]: `%${query.search}%` } },
    ];
  }

  return await Permission.findAll({
    where,
    order: [['module', 'ASC'], ['permission_code', 'ASC']],
  });
};

export const getPermissionById = async (id) => {
  return await Permission.findOne({ where: { id, is_deleted: false } });
};

export const createPermission = async (permData, actorId) => {
  const perm = await Permission.create({
    ...permData,
    is_system_permission: false,
    created_by: actorId,
  });

  await audit({
    actorId,
    action: 'PERMISSION_CREATED',
    targetType: 'permission',
    targetId: perm.id,
    after: perm.toJSON(),
  });

  await invalidateAllPermissionCaches();
  return perm;
};

export const updatePermission = async (id, updateData, actorId) => {
  const perm = await Permission.findOne({ where: { id, is_deleted: false } });
  if (!perm) return null;

  if (perm.is_system_permission && updateData.permission_code && updateData.permission_code !== perm.permission_code) {
    throw new Error('Cannot modify the permission code of a protected system permission.');
  }

  const before = perm.toJSON();
  await perm.update({
    ...updateData,
    updated_by: actorId,
  });

  await audit({
    actorId,
    action: 'PERMISSION_UPDATED',
    targetType: 'permission',
    targetId: perm.id,
    before,
    after: perm.toJSON(),
  });

  await invalidateAllPermissionCaches();
  return perm;
};

export const deletePermission = async (id, actorId) => {
  const perm = await Permission.findOne({ where: { id, is_deleted: false } });
  if (!perm) return null;

  if (perm.is_system_permission) {
    throw new Error('System permissions cannot be deleted.');
  }

  const before = perm.toJSON();
  await perm.update({ is_deleted: true, is_active: false, updated_by: actorId });

  await RolePermission.destroy({ where: { permission_id: id } });
  await UserPermission.destroy({ where: { permission_id: id } });

  await audit({
    actorId,
    action: 'PERMISSION_DELETED',
    targetType: 'permission',
    targetId: perm.id,
    before,
  });

  await invalidateAllPermissionCaches();
  return true;
};

export const getRolePermissions = async (roleId) => {
  const role = await Role.findOne({
    where: { roleId, is_deleted: false },
    include: [{
      model: Permission,
      as: 'permissions',
      where: { is_active: true, is_deleted: false },
      through: { attributes: [] },
    }],
  });
  return role ? role.permissions : [];
};

export const assignPermissionsToRole = async (roleId, permissionIds = [], actorId) => {
  const role = await Role.findOne({ where: { roleId, is_deleted: false } });
  if (!role) throw new Error('Role not found.');

  const currentAssigned = await RolePermission.findAll({ where: { role_id: roleId } });
  const currentPermIds = currentAssigned.map(r => r.permission_id);

  const validPermissions = await Permission.findAll({
    where: {
      id: { [Op.in]: permissionIds },
      is_active: true,
      is_deleted: false,
    },
  });
  const validIds = validPermissions.map(p => p.id);

  await RolePermission.destroy({ where: { role_id: roleId } });

  const newRecords = validIds.map(permId => ({
    role_id: roleId,
    permission_id: permId,
  }));

  if (newRecords.length > 0) {
    await RolePermission.bulkCreate(newRecords);
  }

  await audit({
    actorId,
    action: 'ROLE_PERMISSIONS_UPDATED',
    targetType: 'role',
    targetId: roleId,
    before: { permissionIds: currentPermIds },
    after: { permissionIds: validIds },
  });

  await invalidateAllPermissionCaches();
  return await getRolePermissions(roleId);
};

export const getUserRoles = async (userId) => {
  const user = await User.findOne({
    where: { userId, is_deleted: false },
    include: [{
      model: Role,
      as: 'roles',
      where: { is_deleted: false, is_active: true },
      through: { attributes: ['assigned_by', 'created_at'] },
    }],
  });
  return user ? user.roles : [];
};

export const assignRolesToUser = async (targetUserId, roleIds = [], actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const targetUser = await User.findOne({ where: { userId: targetUserId, is_deleted: false } });
  if (!targetUser) throw new Error('Target user not found.');

  const isActorSuperAdmin = isSuperAdminUser(actorUser);
  const isTargetSuperAdmin = isSuperAdminUser(targetUser);

  const targetRoles = await Role.findAll({
    where: {
      roleId: { [Op.in]: roleIds },
      is_deleted: false,
      is_active: true,
    },
  });

  const containsSuperAdminRole = targetRoles.some(r =>
    r.role_code === 'SUPER_ADMIN' || r.roleName?.toLowerCase() === 'super admin' || r.roleName?.toLowerCase() === 'superadmin'
  );

  if (!isActorSuperAdmin) {
    if (isTargetSuperAdmin) {
      throw new Error('Forbidden: Only Super Administrators can modify Super Admin user roles.');
    }
    if (containsSuperAdminRole) {
      throw new Error('Forbidden: Only Super Administrators can assign the Super Admin role.');
    }
  }

  const currentRoles = await UserRole.findAll({ where: { user_id: targetUserId } });
  const currentRoleIds = currentRoles.map(r => r.role_id);

  await UserRole.destroy({ where: { user_id: targetUserId } });

  const newRecords = targetRoles.map(r => ({
    user_id: targetUserId,
    role_id: r.roleId,
    assigned_by: actorId,
  }));

  if (newRecords.length > 0) {
    await UserRole.bulkCreate(newRecords);
    const primaryRole = targetRoles[0];
    await targetUser.update({
      userRole: primaryRole.role_code || primaryRole.roleName?.toLowerCase(),
    });
  }

  await audit({
    actorId,
    action: 'USER_ROLES_UPDATED',
    targetType: 'user',
    targetId: targetUserId,
    before: { roleIds: currentRoleIds },
    after: { roleIds: targetRoles.map(r => r.roleId) },
  });

  await invalidateUserPermissionCache(targetUserId);
  return await getUserRoles(targetUserId);
};

export const getUserDirectPermissions = async (userId) => {
  return await UserPermission.findAll({
    where: { user_id: userId },
    include: [{
      model: Permission,
      as: 'permission',
      where: { is_active: true, is_deleted: false },
    }],
  });
};

export const assignDirectUserPermissions = async (targetUserId, permissionAssignments = [], actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const targetUser = await User.findOne({ where: { userId: targetUserId, is_deleted: false } });
  if (!targetUser) throw new Error('Target user not found.');

  const isActorSuperAdmin = isSuperAdminUser(actorUser);
  const isTargetSuperAdmin = isSuperAdminUser(targetUser);

  if (!isActorSuperAdmin && isTargetSuperAdmin) {
    throw new Error('Forbidden: Only Super Administrators can modify Super Admin permissions.');
  }

  const beforeRecords = await UserPermission.findAll({ where: { user_id: targetUserId } });

  for (const item of permissionAssignments) {
    const perm = await Permission.findOne({
      where: { id: item.permission_id, is_active: true, is_deleted: false },
    });
    if (!perm) continue;

    const effect = (item.effect || 'ALLOW').toUpperCase();
    if (!['ALLOW', 'DENY'].includes(effect)) continue;

    const existing = await UserPermission.findOne({
      where: { user_id: targetUserId, permission_id: perm.id },
    });

    if (existing) {
      await existing.update({ effect, assigned_by: actorId });
    } else {
      await UserPermission.create({
        user_id: targetUserId,
        permission_id: perm.id,
        effect,
        assigned_by: actorId,
      });
    }
  }

  const afterRecords = await UserPermission.findAll({ where: { user_id: targetUserId } });

  await audit({
    actorId,
    action: 'USER_DIRECT_PERMISSIONS_UPDATED',
    targetType: 'user',
    targetId: targetUserId,
    before: beforeRecords.map(r => ({ permission_id: r.permission_id, effect: r.effect })),
    after: afterRecords.map(r => ({ permission_id: r.permission_id, effect: r.effect })),
  });

  await invalidateUserPermissionCache(targetUserId);
  return await getUserDirectPermissions(targetUserId);
};

export const removeDirectUserPermission = async (targetUserId, permissionId, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const targetUser = await User.findOne({ where: { userId: targetUserId, is_deleted: false } });
  if (!targetUser) throw new Error('Target user not found.');

  const isActorSuperAdmin = isSuperAdminUser(actorUser);
  const isTargetSuperAdmin = isSuperAdminUser(targetUser);

  if (!isActorSuperAdmin && isTargetSuperAdmin) {
    throw new Error('Forbidden: Only Super Administrators can modify Super Admin permissions.');
  }

  const record = await UserPermission.findOne({
    where: { user_id: targetUserId, permission_id: permissionId },
  });

  if (record) {
    await record.destroy();
    await audit({
      actorId,
      action: 'USER_DIRECT_PERMISSION_REMOVED',
      targetType: 'user',
      targetId: targetUserId,
      before: { permission_id: permissionId, effect: record.effect },
    });
    await invalidateUserPermissionCache(targetUserId);
  }

  return true;
};
