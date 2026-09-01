import ServiceProviderProfile from './service_provider_profile.model.js';
import User from '../user/user.model.js';
import ServiceCategory from '../service_category/service_category.model.js';

export const createProfile = async (profileData) => {
  return await ServiceProviderProfile.create(profileData);
};

export const getAllProfiles = async () => {
  return await ServiceProviderProfile.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email'] },
      { model: ServiceCategory, as: 'category', attributes: ['serviceCategoryId', 'serviceCategoryName', 'serviceCategoryImage'] }
    ]
  });
};

export const getProfileById = async (id) => {
  return await ServiceProviderProfile.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email'] },
      { model: ServiceCategory, as: 'category', attributes: ['serviceCategoryId', 'serviceCategoryName', 'serviceCategoryImage'] }
    ]
  });
};

export const updateProfile = async (id, updateData) => {
  const profile = await ServiceProviderProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteProfile = async (id, deletedRemarks, updated_by) => {
  const profile = await ServiceProviderProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteProfiles = async (ids, deletedRemarks, updated_by) => {
  return await ServiceProviderProfile.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};

export const getPendingVerifications = async () => {
  return await ServiceProviderProfile.findAll({
    where: { is_deleted: false, is_verified: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] },
      { model: ServiceCategory, as: 'category', attributes: ['serviceCategoryId', 'serviceCategoryName'] }
    ]
  });
};

export const verifyProfile = async (id, updated_by) => {
  const profile = await ServiceProviderProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_verified: true, updated_by, updatedAt: new Date() });
};

