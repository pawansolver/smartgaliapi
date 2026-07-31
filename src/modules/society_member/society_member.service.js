import SocietyMember from './society_member.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const createMember = async (memberData) => {
  return await SocietyMember.create(memberData);
};

export const getAllMembers = async () => {
  return await SocietyMember.findAll({
    where: { is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society', attributes: ['id', 'society_name'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const getMemberById = async (id) => {
  return await SocietyMember.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: SocietyProfile, as: 'society', attributes: ['id', 'society_name'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const updateMember = async (id, updateData) => {
  const member = await SocietyMember.findOne({ where: { id, is_deleted: false } });
  if (!member) return null;
  return await member.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteMember = async (id, deletedRemarks, updated_by) => {
  const member = await SocietyMember.findOne({ where: { id, is_deleted: false } });
  if (!member) return null;
  return await member.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteMembers = async (ids, deletedRemarks, updated_by) => {
  return await SocietyMember.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
