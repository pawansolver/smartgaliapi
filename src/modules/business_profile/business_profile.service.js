import BusinessProfile from './business_profile.model.js';
import User from '../user/user.model.js';
import BusinessCategory from '../business_category/business_category.model.js';

export const createProfile = async (profileData) => {
  return await BusinessProfile.create(profileData);
};

export const getAllProfiles = async (query = {}) => {
  const whereClause = { is_deleted: false };
  
  if (query.is_verified !== undefined && query.is_verified !== null) {
    whereClause.is_verified = query.is_verified === 'true' || query.is_verified === true;
  }
  
  if (query.is_featured !== undefined && query.is_featured !== null) {
    whereClause.is_featured = query.is_featured === 'true' || query.is_featured === true;
  }

  return await BusinessProfile.findAll({
    where: whereClause,
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email'] },
      { model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'] }
    ]
  });
};

export const getProfileById = async (id) => {
  return await BusinessProfile.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email'] },
      { model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'] }
    ]
  });
};

export const updateProfile = async (id, updateData) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteProfile = async (id, deletedRemarks, updated_by) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const approveProfile = async (id, updated_by) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_verified: true, updated_by, updatedAt: new Date() });
};

export const rejectProfile = async (id, rejectRemarks, updated_by) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  // We can either set it as deleted or keep it but mark it rejected. 
  // Let's mark it as soft deleted with rejection remarks.
  return await profile.update({ is_verified: false, is_deleted: true, deletedRemarks: rejectRemarks, updated_by, updatedAt: new Date() });
};

export const featureProfile = async (id, updated_by) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_featured: true, updated_by, updatedAt: new Date() });
};

export const unfeatureProfile = async (id, updated_by) => {
  const profile = await BusinessProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_featured: false, updated_by, updatedAt: new Date() });
};
