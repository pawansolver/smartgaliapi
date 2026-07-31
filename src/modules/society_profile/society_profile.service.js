import SocietyProfile from './society_profile.model.js';
import User from '../user/user.model.js';

export const createProfile = async (profileData) => {
  return await SocietyProfile.create(profileData);
};

export const getAllProfiles = async () => {
  return await SocietyProfile.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'admin_user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const getProfileById = async (id) => {
  return await SocietyProfile.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'admin_user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const updateProfile = async (id, updateData) => {
  const profile = await SocietyProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteProfile = async (id, deletedRemarks, updated_by) => {
  const profile = await SocietyProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteProfiles = async (ids, deletedRemarks, updated_by) => {
  return await SocietyProfile.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
