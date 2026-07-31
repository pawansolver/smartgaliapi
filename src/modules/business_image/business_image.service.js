import BusinessImage from './business_image.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

export const createImage = async (imageData) => {
  return await BusinessImage.create(imageData);
};

export const getAllImages = async () => {
  return await BusinessImage.findAll({
    where: { is_deleted: false },
    include: [
      { model: BusinessProfile, as: 'business', attributes: ['id', 'business_name'] }
    ]
  });
};

export const getImageById = async (id) => {
  return await BusinessImage.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: BusinessProfile, as: 'business', attributes: ['id', 'business_name'] }
    ]
  });
};

export const updateImage = async (id, updateData) => {
  const image = await BusinessImage.findOne({ where: { id, is_deleted: false } });
  if (!image) return null;
  return await image.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteImage = async (id, deletedRemarks, updated_by) => {
  const image = await BusinessImage.findOne({ where: { id, is_deleted: false } });
  if (!image) return null;
  return await image.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
