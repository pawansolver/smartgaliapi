import BusinessCategory from './business_category.model.js';
import {
  CATEGORY_TEMPLATES,
  getCategoryTemplate,
  getAllCategoryTemplates,
} from './category_specifications.js';

export const createCategory = async (categoryData) => {
  return await BusinessCategory.create(categoryData);
};

export const getAllCategories = async () => {
  const categories = await BusinessCategory.findAll({ where: { is_deleted: false } });
  return categories.map((cat) => {
    const plain = cat.toJSON ? cat.toJSON() : { ...cat.dataValues };
    const template = getCategoryTemplate(plain.name);
    return {
      ...plain,
      subcategories: template.subcategories || [],
      specifications: template.specifications || [],
      suggested_variant_types: template.suggested_variant_types || [],
      suggested_variant_values: template.suggested_variant_values || {},
      suggested_units: template.suggested_units || ['Piece', 'Unit', 'Pack'],
    };
  });
};

export const getCategoryById = async (id) => {
  const category = await BusinessCategory.findOne({ where: { id, is_deleted: false } });
  if (!category) return null;
  const plain = category.toJSON ? category.toJSON() : { ...category.dataValues };
  const template = getCategoryTemplate(plain.name);
  return {
    ...plain,
    subcategories: template.subcategories || [],
    specifications: template.specifications || [],
    suggested_variant_types: template.suggested_variant_types || [],
    suggested_variant_values: template.suggested_variant_values || {},
    suggested_units: template.suggested_units || ['Piece', 'Unit', 'Pack'],
  };
};

export const getCategoryTemplates = async () => {
  return getAllCategoryTemplates();
};

export const getCategorySpecifications = async (categoryIdOrName) => {
  let name = categoryIdOrName;
  if (/^\d+$/.test(categoryIdOrName)) {
    const cat = await BusinessCategory.findOne({ where: { id: categoryIdOrName, is_deleted: false } });
    if (cat) name = cat.name;
  }
  return getCategoryTemplate(name);
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
