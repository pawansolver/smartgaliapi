import AdSponsoredPost from './ad_sponsored.model.js';
import Post from '../post/post.model.js';
import User from '../user/user.model.js';

export const createAdSponsoredPost = async (data) => {
  return await AdSponsoredPost.create(data);
};

export const getAllAdSponsoredPosts = async () => {
  return await AdSponsoredPost.findAll({
    where: { is_deleted: false },
    order: [['id', 'DESC']],
    include: [
      { 
        model: Post, 
        as: 'post',
        attributes: ['id', 'content'],
        include: [
          { model: User, as: 'author', attributes: ['userId', 'userName', 'profile_image'] }
        ]
      }
    ]
  });
};

export const getAdSponsoredPostById = async (id) => {
  return await AdSponsoredPost.findOne({
    where: { id, is_deleted: false },
    include: [
      { 
        model: Post, 
        as: 'post',
        attributes: ['id', 'content'],
        include: [
          { model: User, as: 'author', attributes: ['userId', 'userName', 'profile_image'] }
        ]
      }
    ]
  });
};

export const updateAdSponsoredPost = async (id, updateData) => {
  const sponsored = await AdSponsoredPost.findOne({ where: { id, is_deleted: false } });
  if (!sponsored) return null;
  return await sponsored.update({ ...updateData, updatedAt: new Date() });
};

export const deleteAdSponsoredPost = async (id, deletedRemarks, updated_by) => {
  const sponsored = await AdSponsoredPost.findOne({ where: { id, is_deleted: false } });
  if (!sponsored) return null;
  return await sponsored.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
