import SocietyComplaint from './society_complaint.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const createComplaint = async (complaintData) => {
  return await SocietyComplaint.create(complaintData);
};

export const getAllComplaints = async () => {
  return await SocietyComplaint.findAll({
    where: { is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society', attributes: ['id', 'society_name'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const getComplaintById = async (id) => {
  return await SocietyComplaint.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society', attributes: ['id', 'society_name'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const updateComplaint = async (id, updateData) => {
  const complaint = await SocietyComplaint.findOne({ where: { id, is_deleted: false } });
  if (!complaint) return null;
  return await complaint.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteComplaint = async (id, deletedRemarks, updated_by) => {
  const complaint = await SocietyComplaint.findOne({ where: { id, is_deleted: false } });
  if (!complaint) return null;
  return await complaint.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteComplaints = async (ids, deletedRemarks, updated_by) => {
  return await SocietyComplaint.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
