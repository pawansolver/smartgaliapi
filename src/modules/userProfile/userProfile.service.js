import UserProfile from './userProfile.model.js';
import User from '../user/user.model.js';

export const createUserProfile = async (data) => {
  return await UserProfile.create(data);
};

export const getAllUserProfiles = async () => {
  return await UserProfile.findAll({
    where: { is_deleted: false },
    include: [{ model: User, as: 'user', attributes: { exclude: ['password', 'currentOtp'] } }]
  });
};

export const getUserProfileById = async (id) => {
  return await UserProfile.findOne({
    where: { userProfileId: id, is_deleted: false },
    include: [{ model: User, as: 'user', attributes: { exclude: ['password', 'currentOtp'] } }]
  });
};

export const updateUserProfile = async (id, data) => {
  const profile = await UserProfile.findOne({ where: { userProfileId: id, is_deleted: false } });
  if (profile) {
    return await profile.update(data);
  }
  return null;
};

export const softDeleteUserProfile = async (id, deletedRemarks, updated_by) => {
  const profile = await UserProfile.findOne({ where: { userProfileId: id, is_deleted: false } });
  if (profile) {
    return await profile.update({
      is_deleted: true,
      deletedRemarks,
      updated_by
    });
  }
  return null;
};
