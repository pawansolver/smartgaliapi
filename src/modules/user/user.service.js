import User from './user.model.js';
import Role from '../role/role.model.js';
import UserProfile from '../userProfile/userProfile.model.js';

export const createUser = async (userData) => {
  return await User.create(userData);
};

export const getAllUsers = async () => {
  return await User.findAll({
    where: { is_deleted: false },
    include: [{ model: Role, as: 'role' }]
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
  return await user.update({ is_active: false, updatedAt: new Date() });
};

export const unblockUser = async (userId) => {
  const user = await User.findOne({ where: { userId, is_deleted: false } });
  if (!user) return null;
  return await user.update({ is_active: true, status: 'active', updatedAt: new Date() });
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
