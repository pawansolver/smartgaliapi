import { Op } from 'sequelize';
import { MASTER_MODELS_MAP } from './service_config.models.js';
import { audit } from '../audit_log/audit_log.service.js';

export const getMasterItems = async (masterType, { includeInactive = false, search = null } = {}) => {
  const masterDef = MASTER_MODELS_MAP[masterType];
  if (!masterDef) {
    const err = new Error(`Unknown master type: ${masterType}`);
    err.statusCode = 404;
    throw err;
  }

  const where = { is_deleted: false };
  if (!includeInactive) {
    where.is_active = true;
  }

  if (search) {
    const searchCondition = [];
    if (masterDef.hasLabel) {
      searchCondition.push({ label: { [Op.like]: `%${search}%` } });
    } else {
      searchCondition.push({ name: { [Op.like]: `%${search}%` } });
    }
    searchCondition.push({ code: { [Op.like]: `%${search}%` } });
    where[Op.or] = searchCondition;
  }

  return await masterDef.model.findAll({
    where,
    order: [['display_order', 'ASC'], ['id', 'ASC']],
  });
};

export const getAllServiceMasters = async ({ includeInactive = false } = {}) => {
  const result = {};
  for (const key of Object.keys(MASTER_MODELS_MAP)) {
    result[key] = await getMasterItems(key, { includeInactive });
  }
  return result;
};

export const createMasterItem = async (masterType, data, actorUser, reqMeta = {}) => {
  const masterDef = MASTER_MODELS_MAP[masterType];
  if (!masterDef) {
    const err = new Error(`Unknown master type: ${masterType}`);
    err.statusCode = 404;
    throw err;
  }

  const actorId = actorUser?.id || actorUser?.userId;

  // Check unique code across all rows (including soft-deleted)
  const existing = await masterDef.model.findOne({
    where: { code: data.code }
  });
  if (existing) {
    if (existing.is_deleted) {
      await existing.update({
        ...data,
        is_deleted: false,
        is_active: data.is_active !== false,
        updated_by: actorId,
        updatedAt: new Date(),
      });
      return existing;
    }
    const err = new Error(`Record with code '${data.code}' already exists in ${masterDef.name}`);
    err.statusCode = 409;
    throw err;
  }

  try {
    const item = await masterDef.model.create({
      ...data,
      created_by: actorId,
      created_at: new Date(),
      updatedAt: new Date(),
    });

    // Audit Log
    await audit({
      actorId,
      action: `service_master.create.${masterType}`,
      targetType: masterDef.name,
      targetId: item.id,
      after: item.toJSON(),
      ip: reqMeta.ip,
      ua: reqMeta.ua,
    });

    return item;
  } catch (dbErr) {
    if (dbErr.name === 'SequelizeUniqueConstraintError') {
      const err = new Error(`Record with code '${data.code}' already exists in ${masterDef.name}`);
      err.statusCode = 409;
      throw err;
    }
    throw dbErr;
  }
};

export const updateMasterItem = async (masterType, id, data, actorUser, reqMeta = {}) => {
  const masterDef = MASTER_MODELS_MAP[masterType];
  if (!masterDef) {
    const err = new Error(`Unknown master type: ${masterType}`);
    err.statusCode = 404;
    throw err;
  }

  const item = await masterDef.model.findOne({
    where: { id, is_deleted: false }
  });
  if (!item) {
    const err = new Error(`${masterDef.name} item not found`);
    err.statusCode = 404;
    throw err;
  }

  const beforeSnapshot = item.toJSON();
  const actorId = actorUser?.id || actorUser?.userId;

  await item.update({
    ...data,
    updated_by: actorId,
    updatedAt: new Date(),
  });

  const afterSnapshot = item.toJSON();

  // Audit Log
  await audit({
    actorId,
    action: `service_master.update.${masterType}`,
    targetType: masterDef.name,
    targetId: item.id,
    before: beforeSnapshot,
    after: afterSnapshot,
    ip: reqMeta.ip,
    ua: reqMeta.ua,
  });

  return item;
};

export const toggleMasterStatus = async (masterType, id, isActive, remark, actorUser, reqMeta = {}) => {
  return await updateMasterItem(masterType, id, { is_active: isActive, remark }, actorUser, reqMeta);
};

export const softDeleteMasterItem = async (masterType, id, remark, actorUser, reqMeta = {}) => {
  const masterDef = MASTER_MODELS_MAP[masterType];
  if (!masterDef) {
    const err = new Error(`Unknown master type: ${masterType}`);
    err.statusCode = 404;
    throw err;
  }

  const item = await masterDef.model.findOne({
    where: { id, is_deleted: false }
  });
  if (!item) {
    const err = new Error(`${masterDef.name} item not found`);
    err.statusCode = 404;
    throw err;
  }

  const beforeSnapshot = item.toJSON();
  const actorId = actorUser?.id || actorUser?.userId;

  await item.update({
    is_deleted: true,
    is_active: false,
    deletedRemarks: remark || 'Deactivated by admin',
    updated_by: actorId,
    updatedAt: new Date(),
  });

  await audit({
    actorId,
    action: `service_master.soft_delete.${masterType}`,
    targetType: masterDef.name,
    targetId: item.id,
    before: beforeSnapshot,
    after: item.toJSON(),
    ip: reqMeta.ip,
    ua: reqMeta.ua,
  });

  return { message: `${masterDef.name} deactivated successfully` };
};
