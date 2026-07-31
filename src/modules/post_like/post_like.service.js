import PostLike from './post_like.model.js';
import User from '../user/user.model.js';
import Post from '../post/post.model.js';

export const createLike = async (likeData) => {
  return await PostLike.create(likeData);
};

export const getAllLikes = async () => {
  return await PostLike.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const getLikeById = async (id) => {
  return await PostLike.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const updateLike = async (id, updateData) => {
  const like = await PostLike.findOne({ where: { id, is_deleted: false } });
  if (!like) return null;
  return await like.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteLike = async (id, deletedRemarks, updated_by) => {
  const like = await PostLike.findOne({ where: { id, is_deleted: false } });
  if (!like) return null;
  return await like.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteLikes = async (ids, deletedRemarks, updated_by) => {
  return await PostLike.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
