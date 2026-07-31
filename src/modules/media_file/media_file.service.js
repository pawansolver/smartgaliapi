import MediaFile from './media_file.model.js';
import User from '../user/user.model.js';

export const createFile = async (fileData) => {
  return await MediaFile.create(fileData);
};

export const getAllFiles = async () => {
  return await MediaFile.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'uploader', attributes: ['userId', 'userName', 'email', 'profile_image'] }
    ]
  });
};

export const getFileById = async (id) => {
  return await MediaFile.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'uploader', attributes: ['userId', 'userName', 'email', 'profile_image'] }
    ]
  });
};

export const updateFile = async (id, updateData) => {
  const file = await MediaFile.findOne({ where: { id, is_deleted: false } });
  if (!file) return null;
  return await file.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteFile = async (id, deletedRemarks, updated_by) => {
  const file = await MediaFile.findOne({ where: { id, is_deleted: false } });
  if (!file) return null;
  return await file.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteFiles = async (ids, deletedRemarks, updated_by) => {
  return await MediaFile.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
