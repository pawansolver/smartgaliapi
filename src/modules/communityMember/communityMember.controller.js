import { successResponse, errorResponse } from '../../utils/response.js';
import * as communityMemberService from './communityMember.service.js';

export const createCommunityMember = async (req, res, next) => {
  try {
    const member = await communityMemberService.createCommunityMember(req.body);
    return successResponse(res, 201, 'Community Member added successfully', member);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return errorResponse(res, 400, 'Community Member already exists');
    }
    next(error);
  }
};

export const getAllCommunityMembers = async (req, res, next) => {
  try {
    const members = await communityMemberService.getAllCommunityMembers();
    return successResponse(res, 200, 'Community Members fetched successfully', members);
  } catch (error) {
    next(error);
  }
};

export const getCommunityMemberById = async (req, res, next) => {
  try {
    const member = await communityMemberService.getCommunityMemberById(req.params.id);
    if (!member) {
      return errorResponse(res, 404, 'Community Member not found');
    }
    return successResponse(res, 200, 'Community Member fetched successfully', member);
  } catch (error) {
    next(error);
  }
};

export const updateCommunityMember = async (req, res, next) => {
  try {
    const member = await communityMemberService.updateCommunityMember(req.params.id, req.body);
    if (!member) {
      return errorResponse(res, 404, 'Community Member not found');
    }
    return successResponse(res, 200, 'Community Member updated successfully', member);
  } catch (error) {
    next(error);
  }
};

export const deleteCommunityMember = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const member = await communityMemberService.softDeleteCommunityMember(req.params.id, deletedRemarks, updated_by);
    if (!member) {
      return errorResponse(res, 404, 'Community Member not found');
    }
    return successResponse(res, 200, 'Community Member deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};
