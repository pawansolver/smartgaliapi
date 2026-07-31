import PostShare from './post_share.model.js';
import User from '../user/user.model.js';
import Post from '../post/post.model.js';

export const createShare = async (shareData) => {
  return await PostShare.create(shareData);
};

export const getAllShares = async () => {
  return await PostShare.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const getShareById = async (id) => {
  return await PostShare.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const updateShare = async (id, updateData) => {
  const share = await PostShare.findOne({ where: { id, is_deleted: false } });
  if (!share) return null;
  return await share.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteShare = async (id, deletedRemarks, updated_by) => {
  const share = await PostShare.findOne({ where: { id, is_deleted: false } });
  if (!share) return null;
  return await share.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteShares = async (ids, deletedRemarks, updated_by) => {
  return await PostShare.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
