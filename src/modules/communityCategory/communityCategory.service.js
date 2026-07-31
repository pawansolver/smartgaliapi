import CommunityCategory from './communityCategory.model.js';

export const createCommunityCategory = async (categoryData) => {
  return await CommunityCategory.create(categoryData);
};

export const getAllCommunityCategories = async () => {
  return await CommunityCategory.findAll({ where: { is_deleted: false } });
};

export const getCommunityCategoryById = async (communityCategoryId) => {
  return await CommunityCategory.findOne({ where: { communityCategoryId, is_deleted: false } });
};

export const updateCommunityCategory = async (communityCategoryId, updateData) => {
  const category = await CommunityCategory.findOne({ where: { communityCategoryId, is_deleted: false } });
  if (!category) return null;
  return await category.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteCommunityCategory = async (communityCategoryId, deletedRemarks, updated_by) => {
  const category = await CommunityCategory.findOne({ where: { communityCategoryId, is_deleted: false } });
  if (!category) return null;
  return await category.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
