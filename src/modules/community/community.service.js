import Community from './community.model.js';
import CommunityCategory from '../communityCategory/communityCategory.model.js';
import User from '../user/user.model.js';
import CommunityMember from '../communityMember/communityMember.model.js';
import { Op } from 'sequelize';

export const createCommunity = async (communityData) => {
  return await Community.create(communityData);
};

export const getAllCommunities = async () => {
  return await Community.findAll({
    where: { is_deleted: false },
    include: [
      { model: CommunityCategory, as: 'category' },
      { model: User, as: 'creator' }
    ]
  });
};

export const getCommunityById = async (communityId) => {
  return await Community.findOne({
    where: { communityId, is_deleted: false },
    include: [
      { model: CommunityCategory, as: 'category' },
      { model: User, as: 'creator' }
    ]
  });
};

export const updateCommunity = async (communityId, updateData) => {
  const community = await Community.findOne({ where: { communityId, is_deleted: false } });
  if (!community) return null;
  return await community.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteCommunity = async (communityId, deletedRemarks, updated_by) => {
  const community = await Community.findOne({ where: { communityId, is_deleted: false } });
  if (!community) return null;
  return await community.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

// 1. Join Community
export const joinCommunity = async (communityId, userId) => {
  const existingMember = await CommunityMember.findOne({ where: { community_id: communityId, user_id: userId } });
  if (existingMember) {
    if (existingMember.status === 'left') {
      return await existingMember.update({ status: 'active', joined_at: new Date() });
    }
    return existingMember; // Already active/pending
  }
  return await CommunityMember.create({ community_id: communityId, user_id: userId, role: 'member', status: 'active' });
};

// 2. Leave Community
export const leaveCommunity = async (communityId, userId) => {
  const existingMember = await CommunityMember.findOne({ where: { community_id: communityId, user_id: userId } });
  if (!existingMember || existingMember.status === 'left') return null;
  return await existingMember.update({ status: 'left', updatedAt: new Date() });
};

// 3. Get Community Members
export const getCommunityMembers = async (communityId) => {
  return await CommunityMember.findAll({
    where: { community_id: communityId, status: 'active', is_deleted: false },
    include: [{ model: User, as: 'user', attributes: ['userId', 'name', 'email', 'avatar'] }] // Adjust User attributes as needed
  });
};

// 4. Get My Communities
export const getMyCommunities = async (userId) => {
  const memberships = await CommunityMember.findAll({
    where: { user_id: userId, status: 'active', is_deleted: false },
    include: [{ model: Community, as: 'community' }]
  });
  return memberships.map(m => m.community);
};

// 5. Get Suggested Communities
export const getSuggestedCommunities = async (userId) => {
  // Get IDs of communities the user is already part of
  const userMemberships = await CommunityMember.findAll({
    where: { user_id: userId, status: { [Op.ne]: 'left' } },
    attributes: ['community_id']
  });
  const joinedIds = userMemberships.map(m => m.community_id);

  // Fetch communities excluding those IDs
  return await Community.findAll({
    where: { 
      communityId: { [Op.notIn]: joinedIds },
      is_deleted: false,
      status: 'active'
    },
    limit: 10 // return top 10 suggestions
  });
};

// 6. Invite User
export const inviteUser = async (communityId, inviterId, inviteeId) => {
  const existingMember = await CommunityMember.findOne({ where: { community_id: communityId, user_id: inviteeId } });
  if (existingMember) return existingMember; // Already a member or pending
  return await CommunityMember.create({ community_id: communityId, user_id: inviteeId, role: 'member', status: 'pending' });
};

// 7. Community Requests
export const getPendingCommunities = async () => {
  return await Community.findAll({
    where: { status: 'pending', is_deleted: false },
    include: [
      { model: CommunityCategory, as: 'category' },
      { model: User, as: 'creator' }
    ]
  });
};

export const approveCommunity = async (communityId) => {
  const community = await Community.findOne({ where: { communityId, is_deleted: false } });
  if (!community) return null;
  return await community.update({ status: 'active', updatedAt: new Date() });
};

export const rejectCommunity = async (communityId) => {
  const community = await Community.findOne({ where: { communityId, is_deleted: false } });
  if (!community) return null;
  return await community.update({ status: 'inactive', updatedAt: new Date() });
};
