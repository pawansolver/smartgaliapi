import ServiceCategory from './service_category.model.js';
import { Op } from 'sequelize';

export const createCategory = async (categoryData) => {
  return await ServiceCategory.create(categoryData);
};

export const getAllCategories = async () => {
  return await ServiceCategory.findAll({ where: { is_deleted: false } });
};

export const getCategoryById = async (serviceCategoryId) => {
  return await ServiceCategory.findOne({ where: { serviceCategoryId, is_deleted: false } });
};

export const updateCategory = async (serviceCategoryId, updateData) => {
  const category = await ServiceCategory.findOne({ where: { serviceCategoryId, is_deleted: false } });
  if (!category) return null;
  return await category.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteCategory = async (serviceCategoryId, deletedRemarks, updated_by) => {
  const category = await ServiceCategory.findOne({ where: { serviceCategoryId, is_deleted: false } });
  if (!category) return null;
  return await category.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteCategories = async (serviceCategoryIds, deletedRemarks, updated_by) => {
  return await ServiceCategory.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { serviceCategoryId: { [Op.in]: serviceCategoryIds }, is_deleted: false } }
  );
};
