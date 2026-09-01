import BusinessCategory from './business_category.model.js';

export const createCategory = async (categoryData) => {
  return await BusinessCategory.create(categoryData);
};

export const getAllCategories = async () => {
  return await BusinessCategory.findAll({ where: { is_deleted: false } });
};

export const getCategoryById = async (id) => {
  return await BusinessCategory.findOne({ where: { id, is_deleted: false } });
};

export const updateCategory = async (id, updateData) => {
  const category = await BusinessCategory.findOne({ where: { id, is_deleted: false } });
  if (!category) return null;
  return await category.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteCategory = async (id, deletedRemarks, updated_by) => {
  const category = await BusinessCategory.findOne({ where: { id, is_deleted: false } });
  if (!category) return null;
  return await category.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
