import AdBanner from './ad_banner.model.js';

export const createAdBanner = async (data) => {
  return await AdBanner.create(data);
};

export const getAllAdBanners = async () => {
  return await AdBanner.findAll({
    where: { is_deleted: false },
    order: [['id', 'DESC']]
  });
};

export const getAdBannerById = async (id) => {
  return await AdBanner.findOne({
    where: { id, is_deleted: false }
  });
};

export const updateAdBanner = async (id, updateData) => {
  const banner = await AdBanner.findOne({ where: { id, is_deleted: false } });
  if (!banner) return null;
  return await banner.update({ ...updateData, updatedAt: new Date() });
};

export const deleteAdBanner = async (id, deletedRemarks, updated_by) => {
  const banner = await AdBanner.findOne({ where: { id, is_deleted: false } });
  if (!banner) return null;
  return await banner.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
