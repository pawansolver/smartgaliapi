import SocietyAnnouncement from './society_announcement.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const createAnnouncement = async (announcementData) => {
  return await SocietyAnnouncement.create(announcementData);
};

export const getAllAnnouncements = async () => {
  return await SocietyAnnouncement.findAll({
    where: { is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society', attributes: ['id', 'society_name'] },
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'email'] }
    ]
  });
};

export const getAnnouncementById = async (id) => {
  return await SocietyAnnouncement.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society', attributes: ['id', 'society_name'] },
      { model: User, as: 'creator', attributes: ['userId', 'userName', 'email'] }
    ]
  });
};

export const updateAnnouncement = async (id, updateData) => {
  const announcement = await SocietyAnnouncement.findOne({ where: { id, is_deleted: false } });
  if (!announcement) return null;
  return await announcement.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteAnnouncement = async (id, deletedRemarks, updated_by) => {
  const announcement = await SocietyAnnouncement.findOne({ where: { id, is_deleted: false } });
  if (!announcement) return null;
  return await announcement.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteAnnouncements = async (ids, deletedRemarks, updated_by) => {
  return await SocietyAnnouncement.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
