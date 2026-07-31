import SavedPost from './saved_post.model.js';
import User from '../user/user.model.js';
import Post from '../post/post.model.js';

export const createSavedPost = async (savedData) => {
  return await SavedPost.create(savedData);
};

export const getAllSavedPosts = async () => {
  return await SavedPost.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const getSavedPostById = async (id) => {
  return await SavedPost.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Post, as: 'post', attributes: ['id', 'content'] }
    ]
  });
};

export const updateSavedPost = async (id, updateData) => {
  const savedPost = await SavedPost.findOne({ where: { id, is_deleted: false } });
  if (!savedPost) return null;
  return await savedPost.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteSavedPost = async (id, deletedRemarks, updated_by) => {
  const savedPost = await SavedPost.findOne({ where: { id, is_deleted: false } });
  if (!savedPost) return null;
  return await savedPost.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteSavedPosts = async (ids, deletedRemarks, updated_by) => {
  return await SavedPost.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
