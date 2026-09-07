import Role from './role.model.js';
import Permission from '../permission/permission.model.js';
import RolePermission from '../permission/role_permission.model.js';
import { audit } from '../audit_log/audit_log.service.js';
import { invalidateAllPermissionCaches } from '../permission/permission.service.js';
import { Op } from 'sequelize';

export const createRole = async (roleData, actorId) => {
  const role = await Role.create({
    ...roleData,
    is_system_role: false,
    created_by: actorId,
  });

  await audit({
    actorId,
    action: 'ROLE_CREATED',
    targetType: 'role',
    targetId: role.roleId,
    after: role.toJSON(),
  });

  await invalidateAllPermissionCaches();
  return role;
};

export const getAllRoles = async () => {
  return await Role.findAll({
    where: { is_deleted: false },
    include: [{
      model: Permission,
      as: 'permissions',
      where: { is_active: true, is_deleted: false },
      required: false,
      through: { attributes: [] },
    }],
    order: [['roleId', 'ASC']],
  });
};

export const getRoleById = async (roleId) => {
  return await Role.findOne({
    where: { roleId, is_deleted: false },
    include: [{
      model: Permission,
      as: 'permissions',
      where: { is_active: true, is_deleted: false },
      required: false,
      through: { attributes: [] },
    }],
  });
};

export const updateRole = async (roleId, updateData, actorId) => {
  const role = await Role.findOne({ where: { roleId, is_deleted: false } });
  if (!role) return null;

  // Protect system roles from role_code modification or deactivation
  if (role.is_system_role) {
    if (updateData.role_code && updateData.role_code !== role.role_code) {
      throw new Error('Cannot modify the role code of a protected system role.');
    }
    if (updateData.is_active === false) {
      throw new Error('Protected system roles cannot be deactivated.');
    }
  }

  const before = role.toJSON();
  await role.update({
    ...updateData,
    updated_by: actorId,
    updatedAt: new Date(),
  });

  await audit({
    actorId,
    action: 'ROLE_UPDATED',
    targetType: 'role',
    targetId: role.roleId,
    before,
    after: role.toJSON(),
  });

  await invalidateAllPermissionCaches();
  return role;
};

export const softDeleteRole = async (roleId, deletedRemarks, actorId) => {
  const role = await Role.findOne({ where: { roleId, is_deleted: false } });
  if (!role) return null;

  if (role.is_system_role) {
    throw new Error('System roles cannot be deleted.');
  }

  const before = role.toJSON();
  await role.update({
    is_deleted: true,
    is_active: false,
    deletedRemarks,
    updated_by: actorId,
    updatedAt: new Date(),
  });

  await RolePermission.destroy({ where: { role_id: roleId } });

  await audit({
    actorId,
    action: 'ROLE_DELETED',
    targetType: 'role',
    targetId: role.roleId,
    before,
  });

  await invalidateAllPermissionCaches();
  return true;
};
