import Role from './role.model.js';

export const createRole = async (roleData) => {
  return await Role.create(roleData);
};

export const getAllRoles = async () => {
  return await Role.findAll({ where: { is_deleted: false } });
};

export const getRoleById = async (roleId) => {
  return await Role.findOne({ where: { roleId, is_deleted: false } });
};

export const updateRole = async (roleId, updateData) => {
  const role = await Role.findOne({ where: { roleId, is_deleted: false } });
  if (!role) return null;
  return await role.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteRole = async (roleId, deletedRemarks, updated_by) => {
  const role = await Role.findOne({ where: { roleId, is_deleted: false } });
  if (!role) return null;
  return await role.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
