import { Op } from 'sequelize';
import ServiceCategory from './service_category.model.js';
import ServiceSubcategory from './service_subcategory.model.js';
import { audit } from '../audit_log/audit_log.service.js';

export const createCategory = async (categoryData, imageFile, adminUserId) => {
  const imageUrl = imageFile ? `/uploads/service_category/${imageFile.filename}` : (categoryData.serviceCategoryImage || null);

  const category = await ServiceCategory.create({
    serviceCategoryName: categoryData.serviceCategoryName,
    serviceCategoryImage: imageUrl,
    remark: categoryData.remark,
    created_by: adminUserId,
  });

  await audit({
    actorId: adminUserId,
    action: 'SERVICE_CATEGORY_CREATED',
    targetType: 'service_category',
    targetId: category.serviceCategoryId,
    after: category.toJSON(),
  });

  return category;
};

export const getAllCategories = async (options = {}) => {
  const where = { is_deleted: false };
  if (!options.includeInactive) {
    where.is_active = true;
  }

  const subWhere = { is_deleted: false };
  if (!options.includeInactive) {
    subWhere.is_active = true;
  }

  const categories = await ServiceCategory.findAll({
    where,
    include: [
      {
        model: ServiceSubcategory,
        as: 'subcategories',
        where: subWhere,
        required: false,
      },
    ],
    order: [['serviceCategoryName', 'ASC']],
  });

  return categories.map((cat) => {
    const raw = cat.toJSON();
    raw.slug = (raw.serviceCategoryName || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    raw.subcategoriesCount = raw.subcategories ? raw.subcategories.length : 0;
    return raw;
  });
};

export const getCategoryById = async (id, options = {}) => {
  const subWhere = { is_deleted: false };
  if (!options.includeInactive) {
    subWhere.is_active = true;
  }

  const category = await ServiceCategory.findOne({
    where: { serviceCategoryId: id, is_deleted: false },
    include: [
      {
        model: ServiceSubcategory,
        as: 'subcategories',
        where: subWhere,
        required: false,
      },
    ],
  });

  if (!category) return null;
  const raw = category.toJSON();
  raw.slug = (raw.serviceCategoryName || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  raw.subcategoriesCount = raw.subcategories ? raw.subcategories.length : 0;
  return raw;
};

export const getSubcategoriesByCategory = async (categoryId, options = {}) => {
  // Verify category exists and is not deleted
  const categoryWhere = { serviceCategoryId: categoryId, is_deleted: false };
  if (!options.includeInactive) {
    categoryWhere.is_active = true;
  }

  const category = await ServiceCategory.findOne({ where: categoryWhere });
  if (!category) return null;

  const subWhere = {
    service_category_id: categoryId,
    is_deleted: false,
  };
  if (!options.includeInactive) {
    subWhere.is_active = true;
  }

  return await ServiceSubcategory.findAll({
    where: subWhere,
    include: [
      {
        model: ServiceCategory,
        as: 'category',
        attributes: ['serviceCategoryId', 'serviceCategoryName', 'is_active'],
      },
    ],
    order: [['service_subcategory_name', 'ASC']],
  });
};

export const createSubcategory = async (categoryId, subcategoryData, adminUserId) => {
  if (!categoryId || isNaN(categoryId)) {
    const error = new Error('Valid parent category ID is required');
    error.statusCode = 400;
    throw error;
  }

  const category = await ServiceCategory.findOne({
    where: { serviceCategoryId: categoryId, is_deleted: false },
  });
  if (!category) {
    const error = new Error('Parent service category not found');
    error.statusCode = 404;
    throw error;
  }

  if (!category.is_active) {
    const error = new Error('Cannot add subcategory to an inactive category');
    error.statusCode = 400;
    throw error;
  }

  const name = (subcategoryData.service_subcategory_name || '').trim();
  if (!name || name.length < 2) {
    const error = new Error('Subcategory name must be at least 2 characters');
    error.statusCode = 400;
    throw error;
  }

  const slug = (subcategoryData.service_subcategory_slug || name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  if (!slug) {
    const error = new Error('Subcategory slug is invalid');
    error.statusCode = 400;
    throw error;
  }

  // Prevent duplicate subcategory under same category
  const existingSub = await ServiceSubcategory.findOne({
    where: {
      service_category_id: categoryId,
      [Op.or]: [
        { service_subcategory_name: name },
        { service_subcategory_slug: slug },
      ],
      is_deleted: false,
    },
  });
  if (existingSub) {
    const error = new Error(`Subcategory '${name}' already exists for this category`);
    error.statusCode = 400;
    throw error;
  }

  const subcategory = await ServiceSubcategory.create({
    service_category_id: categoryId,
    service_subcategory_name: name,
    service_subcategory_slug: slug,
    service_subcategory_image: subcategoryData.service_subcategory_image || null,
    is_active: subcategoryData.is_active !== undefined ? Boolean(subcategoryData.is_active) : true,
    remark: subcategoryData.remark || null,
    created_by: adminUserId,
  });

  await audit({
    actorId: adminUserId,
    action: 'SERVICE_SUBCATEGORY_CREATED',
    targetType: 'service_subcategory',
    targetId: subcategory.service_subcategory_id,
    after: subcategory.toJSON(),
  });

  return subcategory;
};

export const updateSubcategory = async (categoryId, subcategoryId, subcategoryData, adminUserId) => {
  if (!categoryId || isNaN(categoryId) || !subcategoryId || isNaN(subcategoryId)) {
    const error = new Error('Valid parent category ID and subcategory ID are required');
    error.statusCode = 400;
    throw error;
  }

  const subcategory = await ServiceSubcategory.findOne({
    where: {
      service_subcategory_id: subcategoryId,
      service_category_id: categoryId,
      is_deleted: false,
    },
  });

  if (!subcategory) {
    const error = new Error('Service subcategory not found under this category');
    error.statusCode = 404;
    throw error;
  }

  const previousData = subcategory.toJSON();
  const updatePayload = {
    updated_by: adminUserId,
    updatedAt: new Date(),
  };

  if (subcategoryData.service_subcategory_name !== undefined) {
    const name = subcategoryData.service_subcategory_name.trim();
    if (!name || name.length < 2) {
      const error = new Error('Subcategory name must be at least 2 characters');
      error.statusCode = 400;
      throw error;
    }
    updatePayload.service_subcategory_name = name;

    const slug = (subcategoryData.service_subcategory_slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    updatePayload.service_subcategory_slug = slug;

    // Check duplicate
    const duplicate = await ServiceSubcategory.findOne({
      where: {
        service_category_id: categoryId,
        service_subcategory_id: { [Op.ne]: subcategoryId },
        [Op.or]: [
          { service_subcategory_name: name },
          { service_subcategory_slug: slug },
        ],
        is_deleted: false,
      },
    });
    if (duplicate) {
      const error = new Error(`Subcategory '${name}' already exists for this category`);
      error.statusCode = 400;
      throw error;
    }
  } else if (subcategoryData.service_subcategory_slug !== undefined) {
    const slug = subcategoryData.service_subcategory_slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    updatePayload.service_subcategory_slug = slug;

    const duplicate = await ServiceSubcategory.findOne({
      where: {
        service_category_id: categoryId,
        service_subcategory_id: { [Op.ne]: subcategoryId },
        service_subcategory_slug: slug,
        is_deleted: false,
      },
    });
    if (duplicate) {
      const error = new Error(`Subcategory slug '${slug}' already exists for this category`);
      error.statusCode = 400;
      throw error;
    }
  }

  if (subcategoryData.is_active !== undefined) {
    updatePayload.is_active = Boolean(subcategoryData.is_active);
  }
  if (subcategoryData.service_subcategory_image !== undefined) {
    updatePayload.service_subcategory_image = subcategoryData.service_subcategory_image;
  }
  if (subcategoryData.remark !== undefined) {
    updatePayload.remark = subcategoryData.remark;
  }

  await subcategory.update(updatePayload);

  await audit({
    actorId: adminUserId,
    action: 'SERVICE_SUBCATEGORY_UPDATED',
    targetType: 'service_subcategory',
    targetId: subcategory.service_subcategory_id,
    before: previousData,
    after: subcategory.toJSON(),
  });

  return subcategory;
};

export const deleteSubcategory = async (categoryId, subcategoryId, deletedRemarks, adminUserId) => {
  const subcategory = await ServiceSubcategory.findOne({
    where: {
      service_subcategory_id: subcategoryId,
      service_category_id: categoryId,
      is_deleted: false,
    },
  });

  if (!subcategory) return null;

  const previousData = subcategory.toJSON();
  await subcategory.update({
    is_deleted: true,
    is_active: false,
    deletedRemarks: deletedRemarks || 'Soft deleted by admin',
    updated_by: adminUserId,
    updatedAt: new Date(),
  });

  await audit({
    actorId: adminUserId,
    action: 'SERVICE_SUBCATEGORY_DELETED',
    targetType: 'service_subcategory',
    targetId: subcategory.service_subcategory_id,
    before: previousData,
    after: subcategory.toJSON(),
  });

  return subcategory;
};

export const updateCategory = async (id, categoryData, imageFile, adminUserId) => {
  const category = await ServiceCategory.findOne({
    where: { serviceCategoryId: id, is_deleted: false },
  });
  if (!category) return null;

  const previousData = category.toJSON();
  const updatePayload = {
    serviceCategoryName: categoryData.serviceCategoryName ?? category.serviceCategoryName,
    remark: categoryData.remark ?? category.remark,
    is_active: categoryData.is_active !== undefined ? categoryData.is_active : category.is_active,
    updated_by: adminUserId,
    updatedAt: new Date(),
  };

  if (imageFile) {
    updatePayload.serviceCategoryImage = `/uploads/service_category/${imageFile.filename}`;
  } else if (categoryData.serviceCategoryImage !== undefined) {
    updatePayload.serviceCategoryImage = categoryData.serviceCategoryImage;
  }

  await category.update(updatePayload);

  await audit({
    actorId: adminUserId,
    action: 'SERVICE_CATEGORY_UPDATED',
    targetType: 'service_category',
    targetId: category.serviceCategoryId,
    before: previousData,
    after: category.toJSON(),
  });

  return category;
};

export const deleteCategory = async (id, deletedRemarks, adminUserId) => {
  const category = await ServiceCategory.findOne({
    where: { serviceCategoryId: id, is_deleted: false },
  });
  if (!category) return null;

  const previousData = category.toJSON();
  await category.update({
    is_deleted: true,
    deletedRemarks: deletedRemarks || 'Soft deleted by admin',
    updated_by: adminUserId,
    updatedAt: new Date(),
  });

  await audit({
    actorId: adminUserId,
    action: 'SERVICE_CATEGORY_DELETED',
    targetType: 'service_category',
    targetId: category.serviceCategoryId,
    before: previousData,
    after: category.toJSON(),
  });

  return category;
};

export const bulkDeleteCategories = async (ids, deletedRemarks, adminUserId) => {
  return await ServiceCategory.update(
    {
      is_deleted: true,
      deletedRemarks: deletedRemarks || 'Bulk soft delete by admin',
      updated_by: adminUserId,
      updatedAt: new Date(),
    },
    {
      where: {
        serviceCategoryId: ids,
        is_deleted: false,
      },
    }
  );
};
