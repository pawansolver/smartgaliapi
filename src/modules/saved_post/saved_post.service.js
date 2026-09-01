import SavedPost from './saved_post.model.js';
import User from '../user/user.model.js';
import Post from '../post/post.model.js';

export const createSavedPost = async (savedData) => {
  const existing = await SavedPost.findOne({
    where: { user_id: savedData.user_id, post_id: savedData.post_id }
  });
  if (existing) {
    if (existing.is_deleted) {
      return await existing.update({ is_deleted: false, updatedAt: new Date() });
    }
    return existing;
  }
  return await SavedPost.create(savedData);
};

export const getAllSavedPosts = async (userId) => {
  const where = { is_deleted: false };
  if (userId) where.user_id = userId;
  return await SavedPost.findAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const getSavedPostById = async (id, userId) => {
  return await SavedPost.findOne({
    where: { id, user_id: userId, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const updateSavedPost = async (id, userId, updateData) => {
  const savedPost = await SavedPost.findOne({ where: { id, user_id: userId, is_deleted: false } });
  if (!savedPost) return null;
  return await savedPost.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteSavedPost = async (id, deletedRemarks, updated_by, userId) => {
  let savedPost = await SavedPost.findOne({ where: { id, user_id: userId, is_deleted: false } });
  if (!savedPost && userId) {
    savedPost = await SavedPost.findOne({ where: { post_id: id, user_id: userId, is_deleted: false } });
  }
  if (!savedPost) return null;
  return await savedPost.update({ is_deleted: true, deletedRemarks, updated_by: updated_by || userId, updatedAt: new Date() });
};

export const bulkSoftDeleteSavedPosts = async (ids, userId, deletedRemarks, updated_by) => {
  return await SavedPost.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, user_id: userId, is_deleted: false } }
  );
};
