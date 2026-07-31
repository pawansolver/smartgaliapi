import CommunityMember from './communityMember.model.js';
import Community from '../community/community.model.js';
import User from '../user/user.model.js';

export const createCommunityMember = async (memberData) => {
  return await CommunityMember.create(memberData);
};

export const getAllCommunityMembers = async () => {
  return await CommunityMember.findAll({
    where: { is_deleted: false },
    include: [
      { model: Community, as: 'community' },
      { model: User, as: 'user' }
    ]
  });
};

export const getCommunityMemberById = async (communityMemberId) => {
  return await CommunityMember.findOne({
    where: { communityMemberId, is_deleted: false },
    include: [
      { model: Community, as: 'community' },
      { model: User, as: 'user' }
    ]
  });
};

export const updateCommunityMember = async (communityMemberId, updateData) => {
  const member = await CommunityMember.findOne({ where: { communityMemberId, is_deleted: false } });
  if (!member) return null;
  return await member.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteCommunityMember = async (communityMemberId, deletedRemarks, updated_by) => {
  const member = await CommunityMember.findOne({ where: { communityMemberId, is_deleted: false } });
  if (!member) return null;
  return await member.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
