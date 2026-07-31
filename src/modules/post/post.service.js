import Post from './post.model.js';
import User from '../user/user.model.js';
import Community from '../community/community.model.js';

export const createPost = async (postData) => {
  return await Post.create(postData);
};

export const getAllPosts = async () => {
  return await Post.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'author', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Community, as: 'community', attributes: ['communityId', 'communityName'] }
    ]
  });
};

export const getPostById = async (id) => {
  return await Post.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'author', attributes: ['userId', 'userName', 'profile_image'] },
      { model: Community, as: 'community', attributes: ['communityId', 'communityName'] }
    ]
  });
};

export const updatePost = async (id, updateData) => {
  const post = await Post.findOne({ where: { id, is_deleted: false } });
  if (!post) return null;
  return await post.update({ ...updateData, updatedAt: new Date() });
};

export const softDeletePost = async (id, deletedRemarks, updated_by) => {
  const post = await Post.findOne({ where: { id, is_deleted: false } });
  if (!post) return null;
  return await post.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeletePosts = async (ids, deletedRemarks, updated_by) => {
  return await Post.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
