import Follow from './follow.model.js';
import User from '../user/user.model.js';

export const createFollow = async (followData) => {
  return await Follow.create(followData);
};

export const getAllFollows = async () => {
  return await Follow.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'follower', attributes: ['userId', 'userName', 'profile_image'] },
      { model: User, as: 'following', attributes: ['userId', 'userName', 'profile_image'] }
    ]
  });
};

export const getFollowById = async (id) => {
  return await Follow.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'follower', attributes: ['userId', 'userName', 'profile_image'] },
      { model: User, as: 'following', attributes: ['userId', 'userName', 'profile_image'] }
    ]
  });
};

export const updateFollow = async (id, updateData) => {
  const follow = await Follow.findOne({ where: { id, is_deleted: false } });
  if (!follow) return null;
  return await follow.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteFollow = async (id, deletedRemarks, updated_by) => {
  const follow = await Follow.findOne({ where: { id, is_deleted: false } });
  if (!follow) return null;
  return await follow.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteFollows = async (ids, deletedRemarks, updated_by) => {
  return await Follow.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
