import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import ComplaintCategory from './complaint_category.model.js';
import ComplaintSubCategory from './complaint_sub_category.model.js';
import ComplaintLocationType from './complaint_location_type.model.js';
import { audit } from '../audit_log/audit_log.service.js';

const toSlug = (text) =>
  String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/^-+|-+$/g, '');

// ── 1. Complaint Categories ───────────────────────────────────────────────────

export const listCategories = async ({ include_inactive = false, search = '' } = {}) => {
  const where = { is_deleted: false };
  if (!include_inactive) {
    where.is_active = true;
  }
  if (search && search.trim()) {
    const term = search.trim();
    where[Op.or] = [
      { name: { [Op.like]: `%${term}%` } },
      { slug: { [Op.like]: `%${term}%` } },
      { description: { [Op.like]: `%${term}%` } },
    ];
  }

  return await ComplaintCategory.findAll({
    where,
    order: [['display_order', 'ASC'], ['id', 'ASC']],
    include: [
      {
        model: ComplaintSubCategory,
        as: 'subCategories',
        where: include_inactive ? { is_deleted: false } : { is_deleted: false, is_active: true },
        required: false,
        order: [['display_order', 'ASC']],
      },
    ],
  });
};

export const getCategoryById = async (id) => {
  return await ComplaintCategory.findOne({
    where: { id, is_deleted: false },
    include: [
      {
        model: ComplaintSubCategory,
        as: 'subCategories',
        where: { is_deleted: false },
        required: false,
      },
    ],
  });
};

export const createCategory = async (payload, actorId, meta = {}) => {
  const name = payload.name.trim();
  const slug = payload.slug ? toSlug(payload.slug) : toSlug(name);

  const existing = await ComplaintCategory.findOne({
    where: {
      [Op.or]: [{ name }, { slug }],
      is_deleted: false,
    },
  });
  if (existing) {
    const err = new Error(`Category with name "${name}" or slug "${slug}" already exists.`);
    err.statusCode = 409;
    throw err;
  }

  const category = await ComplaintCategory.create({
    name,
    slug,
    description: payload.description || null,
    icon: payload.icon || 'assignment_outlined',
    display_order: payload.display_order ?? 0,
    is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
    created_by: actorId,
    created_at: new Date(),
  });

  void audit({
    actorId,
    action: 'CATEGORY_CREATED',
    targetType: 'complaint_category',
    targetId: category.id,
    after: category.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return category;
};

export const updateCategory = async (id, payload, actorId, meta = {}) => {
  const category = await ComplaintCategory.findOne({ where: { id, is_deleted: false } });
  if (!category) return null;

  const before = category.toJSON();
  const updates = { updated_by: actorId, updatedAt: new Date() };

  if (payload.name) {
    const name = payload.name.trim();
    const slug = payload.slug ? toSlug(payload.slug) : toSlug(name);
    const conflict = await ComplaintCategory.findOne({
      where: {
        id: { [Op.ne]: id },
        [Op.or]: [{ name }, { slug }],
        is_deleted: false,
      },
    });
    if (conflict) {
      const err = new Error(`Category with name "${name}" or slug "${slug}" already exists.`);
      err.statusCode = 409;
      throw err;
    }
    updates.name = name;
    updates.slug = slug;
  } else if (payload.slug) {
    const slug = toSlug(payload.slug);
    const conflict = await ComplaintCategory.findOne({
      where: { id: { [Op.ne]: id }, slug, is_deleted: false },
    });
    if (conflict) {
      const err = new Error(`Category with slug "${slug}" already exists.`);
      err.statusCode = 409;
      throw err;
    }
    updates.slug = slug;
  }

  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.icon !== undefined) updates.icon = payload.icon;
  if (payload.display_order !== undefined) updates.display_order = payload.display_order;
  if (payload.is_active !== undefined) updates.is_active = Boolean(payload.is_active);

  await category.update(updates);

  void audit({
    actorId,
    action: 'CATEGORY_UPDATED',
    targetType: 'complaint_category',
    targetId: id,
    before,
    after: category.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return category;
};

export const toggleCategoryStatus = async (id, isActive, actorId, meta = {}) => {
  const category = await ComplaintCategory.findOne({ where: { id, is_deleted: false } });
  if (!category) return null;

  const before = category.toJSON();
  await category.update({
    is_active: Boolean(isActive),
    updated_by: actorId,
    updatedAt: new Date(),
  });

  void audit({
    actorId,
    action: isActive ? 'CATEGORY_ACTIVATED' : 'CATEGORY_DEACTIVATED',
    targetType: 'complaint_category',
    targetId: id,
    before,
    after: category.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return category;
};

export const deleteCategory = async (id, actorId, meta = {}) => {
  const category = await ComplaintCategory.findOne({ where: { id, is_deleted: false } });
  if (!category) return null;

  const before = category.toJSON();
  // Safe soft-delete: retains historical references
  await category.update({
    is_deleted: true,
    is_active: false,
    deletedRemarks: 'Deactivated by Super Admin',
    updated_by: actorId,
    updatedAt: new Date(),
  });

  void audit({
    actorId,
    action: 'CATEGORY_DEACTIVATED',
    targetType: 'complaint_category',
    targetId: id,
    before,
    after: category.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return true;
};

// ── 2. Complaint Sub-Categories ───────────────────────────────────────────────

export const listSubCategories = async ({ category_id, include_inactive = false, search = '' } = {}) => {
  const where = { is_deleted: false };
  if (category_id) {
    where.category_id = category_id;
  }
  if (!include_inactive) {
    where.is_active = true;
  }
  if (search && search.trim()) {
    const term = search.trim();
    where[Op.or] = [
      { name: { [Op.like]: `%${term}%` } },
      { slug: { [Op.like]: `%${term}%` } },
      { description: { [Op.like]: `%${term}%` } },
    ];
  }

  return await ComplaintSubCategory.findAll({
    where,
    order: [['display_order', 'ASC'], ['id', 'ASC']],
    include: [
      {
        model: ComplaintCategory,
        as: 'category',
        attributes: ['id', 'name', 'slug', 'is_active'],
      },
    ],
  });
};

export const getSubCategoryById = async (id) => {
  return await ComplaintSubCategory.findOne({
    where: { id, is_deleted: false },
    include: [
      {
        model: ComplaintCategory,
        as: 'category',
        attributes: ['id', 'name', 'slug', 'is_active'],
      },
    ],
  });
};

export const createSubCategory = async (payload, actorId, meta = {}) => {
  const parentCategory = await ComplaintCategory.findOne({
    where: { id: payload.category_id, is_deleted: false },
  });
  if (!parentCategory) {
    const err = new Error('Parent category does not exist.');
    err.statusCode = 404;
    throw err;
  }

  const name = payload.name.trim();
  const slug = payload.slug ? toSlug(payload.slug) : toSlug(name);

  const existing = await ComplaintSubCategory.findOne({
    where: {
      category_id: payload.category_id,
      [Op.or]: [{ name }, { slug }],
      is_deleted: false,
    },
  });
  if (existing) {
    const err = new Error(`Sub-category "${name}" already exists under category "${parentCategory.name}".`);
    err.statusCode = 409;
    throw err;
  }

  const subCategory = await ComplaintSubCategory.create({
    category_id: payload.category_id,
    name,
    slug,
    description: payload.description || null,
    display_order: payload.display_order ?? 0,
    is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
    created_by: actorId,
    created_at: new Date(),
  });

  void audit({
    actorId,
    action: 'SUBCATEGORY_CREATED',
    targetType: 'complaint_sub_category',
    targetId: subCategory.id,
    after: subCategory.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return subCategory;
};

export const updateSubCategory = async (id, payload, actorId, meta = {}) => {
  const subCategory = await ComplaintSubCategory.findOne({ where: { id, is_deleted: false } });
  if (!subCategory) return null;

  const before = subCategory.toJSON();
  const categoryId = payload.category_id || subCategory.category_id;

  if (payload.category_id && payload.category_id !== subCategory.category_id) {
    const parentCategory = await ComplaintCategory.findOne({
      where: { id: payload.category_id, is_deleted: false },
    });
    if (!parentCategory) {
      const err = new Error('New parent category does not exist.');
      err.statusCode = 404;
      throw err;
    }
  }

  const updates = { category_id: categoryId, updated_by: actorId, updatedAt: new Date() };

  if (payload.name) {
    const name = payload.name.trim();
    const slug = payload.slug ? toSlug(payload.slug) : toSlug(name);
    const conflict = await ComplaintSubCategory.findOne({
      where: {
        id: { [Op.ne]: id },
        category_id: categoryId,
        [Op.or]: [{ name }, { slug }],
        is_deleted: false,
      },
    });
    if (conflict) {
      const err = new Error(`Sub-category "${name}" already exists under this category.`);
      err.statusCode = 409;
      throw err;
    }
    updates.name = name;
    updates.slug = slug;
  } else if (payload.slug) {
    const slug = toSlug(payload.slug);
    const conflict = await ComplaintSubCategory.findOne({
      where: { id: { [Op.ne]: id }, category_id: categoryId, slug, is_deleted: false },
    });
    if (conflict) {
      const err = new Error(`Sub-category slug "${slug}" already exists under this category.`);
      err.statusCode = 409;
      throw err;
    }
    updates.slug = slug;
  }

  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.display_order !== undefined) updates.display_order = payload.display_order;
  if (payload.is_active !== undefined) updates.is_active = Boolean(payload.is_active);

  await subCategory.update(updates);

  void audit({
    actorId,
    action: 'SUBCATEGORY_UPDATED',
    targetType: 'complaint_sub_category',
    targetId: id,
    before,
    after: subCategory.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return subCategory;
};

export const toggleSubCategoryStatus = async (id, isActive, actorId, meta = {}) => {
  const subCategory = await ComplaintSubCategory.findOne({ where: { id, is_deleted: false } });
  if (!subCategory) return null;

  const before = subCategory.toJSON();
  await subCategory.update({
    is_active: Boolean(isActive),
    updated_by: actorId,
    updatedAt: new Date(),
  });

  void audit({
    actorId,
    action: isActive ? 'SUBCATEGORY_ACTIVATED' : 'SUBCATEGORY_DEACTIVATED',
    targetType: 'complaint_sub_category',
    targetId: id,
    before,
    after: subCategory.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return subCategory;
};

export const deleteSubCategory = async (id, actorId, meta = {}) => {
  const subCategory = await ComplaintSubCategory.findOne({ where: { id, is_deleted: false } });
  if (!subCategory) return null;

  const before = subCategory.toJSON();
  await subCategory.update({
    is_deleted: true,
    is_active: false,
    deletedRemarks: 'Deactivated by Super Admin',
    updated_by: actorId,
    updatedAt: new Date(),
  });

  void audit({
    actorId,
    action: 'SUBCATEGORY_DEACTIVATED',
    targetType: 'complaint_sub_category',
    targetId: id,
    before,
    after: subCategory.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return true;
};

// ── 3. Complaint Location Types ───────────────────────────────────────────────

export const listLocationTypes = async ({ include_inactive = false, search = '' } = {}) => {
  const where = { is_deleted: false };
  if (!include_inactive) {
    where.is_active = true;
  }
  if (search && search.trim()) {
    const term = search.trim();
    where[Op.or] = [
      { name: { [Op.like]: `%${term}%` } },
      { code: { [Op.like]: `%${term}%` } },
      { description: { [Op.like]: `%${term}%` } },
    ];
  }

  return await ComplaintLocationType.findAll({
    where,
    order: [['display_order', 'ASC'], ['id', 'ASC']],
  });
};

export const getLocationTypeById = async (id) => {
  return await ComplaintLocationType.findOne({
    where: { id, is_deleted: false },
  });
};

export const createLocationType = async (payload, actorId, meta = {}) => {
  const name = payload.name.trim();
  const code = payload.code ? toSlug(payload.code) : toSlug(name);

  const existing = await ComplaintLocationType.findOne({
    where: {
      [Op.or]: [{ name }, { code }],
      is_deleted: false,
    },
  });
  if (existing) {
    const err = new Error(`Location type with name "${name}" or code "${code}" already exists.`);
    err.statusCode = 409;
    throw err;
  }

  const locationType = await ComplaintLocationType.create({
    name,
    code,
    description: payload.description || null,
    icon: payload.icon || 'place_outlined',
    display_order: payload.display_order ?? 0,
    is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
    created_by: actorId,
    created_at: new Date(),
  });

  void audit({
    actorId,
    action: 'LOCATION_TYPE_CREATED',
    targetType: 'complaint_location_type',
    targetId: locationType.id,
    after: locationType.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return locationType;
};

export const updateLocationType = async (id, payload, actorId, meta = {}) => {
  const locationType = await ComplaintLocationType.findOne({ where: { id, is_deleted: false } });
  if (!locationType) return null;

  const before = locationType.toJSON();
  const updates = { updated_by: actorId, updatedAt: new Date() };

  if (payload.name) {
    const name = payload.name.trim();
    const code = payload.code ? toSlug(payload.code) : toSlug(name);
    const conflict = await ComplaintLocationType.findOne({
      where: {
        id: { [Op.ne]: id },
        [Op.or]: [{ name }, { code }],
        is_deleted: false,
      },
    });
    if (conflict) {
      const err = new Error(`Location type with name "${name}" or code "${code}" already exists.`);
      err.statusCode = 409;
      throw err;
    }
    updates.name = name;
    updates.code = code;
  } else if (payload.code) {
    const code = toSlug(payload.code);
    const conflict = await ComplaintLocationType.findOne({
      where: { id: { [Op.ne]: id }, code, is_deleted: false },
    });
    if (conflict) {
      const err = new Error(`Location type code "${code}" already exists.`);
      err.statusCode = 409;
      throw err;
    }
    updates.code = code;
  }

  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.icon !== undefined) updates.icon = payload.icon;
  if (payload.display_order !== undefined) updates.display_order = payload.display_order;
  if (payload.is_active !== undefined) updates.is_active = Boolean(payload.is_active);

  await locationType.update(updates);

  void audit({
    actorId,
    action: 'LOCATION_TYPE_UPDATED',
    targetType: 'complaint_location_type',
    targetId: id,
    before,
    after: locationType.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return locationType;
};

export const toggleLocationTypeStatus = async (id, isActive, actorId, meta = {}) => {
  const locationType = await ComplaintLocationType.findOne({ where: { id, is_deleted: false } });
  if (!locationType) return null;

  const before = locationType.toJSON();
  await locationType.update({
    is_active: Boolean(isActive),
    updated_by: actorId,
    updatedAt: new Date(),
  });

  void audit({
    actorId,
    action: isActive ? 'LOCATION_TYPE_ACTIVATED' : 'LOCATION_TYPE_DEACTIVATED',
    targetType: 'complaint_location_type',
    targetId: id,
    before,
    after: locationType.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return locationType;
};

export const deleteLocationType = async (id, actorId, meta = {}) => {
  const locationType = await ComplaintLocationType.findOne({ where: { id, is_deleted: false } });
  if (!locationType) return null;

  const before = locationType.toJSON();
  await locationType.update({
    is_deleted: true,
    is_active: false,
    deletedRemarks: 'Deactivated by Super Admin',
    updated_by: actorId,
    updatedAt: new Date(),
  });

  void audit({
    actorId,
    action: 'LOCATION_TYPE_DEACTIVATED',
    targetType: 'complaint_location_type',
    targetId: id,
    before,
    after: locationType.toJSON(),
    ip: meta.ip,
    ua: meta.userAgent,
  });

  return true;
};

// ── 4. Batch Reorder ─────────────────────────────────────────────────────────

export const reorderItems = async (modelType, items, actorId, meta = {}) => {
  const models = {
    category: ComplaintCategory,
    subCategory: ComplaintSubCategory,
    locationType: ComplaintLocationType,
  };
  const Model = models[modelType];
  if (!Model) throw new Error('Invalid model type for reordering.');

  const transaction = await sequelize.transaction();
  try {
    for (const item of items) {
      await Model.update(
        { display_order: item.display_order, updated_by: actorId, updatedAt: new Date() },
        { where: { id: item.id }, transaction }
      );
    }
    await transaction.commit();

    void audit({
      actorId,
      action: `${modelType.toUpperCase()}_REORDERED`,
      targetType: `complaint_${modelType}`,
      after: { itemsCount: items.length },
      ip: meta.ip,
      ua: meta.userAgent,
    });

    return true;
  } catch (err) {
    if (!transaction.finished) await transaction.rollback();
    throw err;
  }
};
