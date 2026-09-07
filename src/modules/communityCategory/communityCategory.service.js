import CommunityCategory from './communityCategory.model.js';
import env from '../../config/env.js';

/**
 * Normalize category icon:
 * - If it's an emoji (e.g. 🏏, 🏢), return it as-is.
 * - If it's a file upload path or URL, rebase to current server's origin.
 */
const normalizeIconUrl = (iconUrl) => {
  if (!iconUrl) return null;
  const raw = iconUrl.trim();
  if (!raw) return null;

  // Emoji or plain icon identifier (does not contain path separators or http)
  if (!raw.includes('/') && !raw.includes('\\') && !raw.startsWith('http')) {
    return raw;
  }

  // Absolute URL already pointing to our public media origin
  if (raw.startsWith(env.publicMediaOrigin)) return raw;

  // Contains /uploads/ path -> rebase to current server origin
  const uploadsIdx = raw.indexOf('/uploads/');
  if (uploadsIdx !== -1) {
    return `${env.publicMediaOrigin}${raw.slice(uploadsIdx)}`;
  }

  // Relative path starting with uploads/
  if (raw.startsWith('uploads/')) {
    return `${env.publicMediaOrigin}/${raw}`;
  }

  return raw;
};

export const createCommunityCategory = async (categoryData) => {
  const cat = await CommunityCategory.create(categoryData);
  const json = cat.toJSON();
  json.communityCategoryIcon = normalizeIconUrl(json.communityCategoryIcon);
  json.id = json.communityCategoryId;
  json.name = json.communityCategoryName;
  return json;
};

export const getAllCommunityCategories = async () => {
  const cats = await CommunityCategory.findAll({
    where: { is_deleted: false, is_active: true },
    order: [['communityCategoryName', 'ASC']],
  });
  return cats.map((cat) => {
    const json = cat.toJSON();
    json.communityCategoryIcon = normalizeIconUrl(json.communityCategoryIcon);
    json.id = json.communityCategoryId;
    json.name = json.communityCategoryName;
    return json;
  });
};

export const getCommunityCategoryById = async (communityCategoryId) => {
  const category = await CommunityCategory.findOne({ where: { communityCategoryId, is_deleted: false } });
  if (!category) return null;
  const json = category.toJSON();
  json.communityCategoryIcon = normalizeIconUrl(json.communityCategoryIcon);
  json.id = json.communityCategoryId;
  json.name = json.communityCategoryName;
  return json;
};

export const updateCommunityCategory = async (communityCategoryId, updateData) => {
  const category = await CommunityCategory.findOne({ where: { communityCategoryId, is_deleted: false } });
  if (!category) return null;
  const updated = await category.update({ ...updateData, updatedAt: new Date() });
  const json = updated.toJSON();
  json.communityCategoryIcon = normalizeIconUrl(json.communityCategoryIcon);
  json.id = json.communityCategoryId;
  json.name = json.communityCategoryName;
  return json;
};

export const softDeleteCommunityCategory = async (communityCategoryId, deletedRemarks, updated_by) => {
  const category = await CommunityCategory.findOne({ where: { communityCategoryId, is_deleted: false } });
  if (!category) return null;
  return await category.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
