import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyMemberService from './society_member.service.js';

export const createMember = async (req, res, next) => {
  try {
    const member = await societyMemberService.createMember(req.body);
    return successResponse(res, 201, 'Society member created successfully', member);
  } catch (error) {
    next(error);
  }
};

export const getAllMembers = async (req, res, next) => {
  try {
    const members = await societyMemberService.getAllMembers();
    return successResponse(res, 200, 'Society members fetched successfully', members);
  } catch (error) {
    next(error);
  }
};

export const getMemberById = async (req, res, next) => {
  try {
    const member = await societyMemberService.getMemberById(req.params.id);
    if (!member) {
      return errorResponse(res, 404, 'Society member not found');
    }
    return successResponse(res, 200, 'Society member fetched successfully', member);
  } catch (error) {
    next(error);
  }
};

export const updateMember = async (req, res, next) => {
  try {
    const member = await societyMemberService.updateMember(req.params.id, req.body);
    if (!member) {
      return errorResponse(res, 404, 'Society member not found');
    }
    return successResponse(res, 200, 'Society member updated successfully', member);
  } catch (error) {
    next(error);
  }
};

export const deleteMember = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const member = await societyMemberService.softDeleteMember(req.params.id, deletedRemarks, updated_by);
    if (!member) {
      return errorResponse(res, 404, 'Society member not found');
    }
    return successResponse(res, 200, 'Society member deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteMembers = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await societyMemberService.bulkSoftDeleteMembers(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Society members deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
