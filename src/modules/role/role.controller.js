import { successResponse, errorResponse } from '../../utils/response.js';
import * as roleService from './role.service.js';

export const createRole = async (req, res, next) => {
  try {
    const role = await roleService.createRole(req.body);
    return successResponse(res, 201, 'Role created successfully', role);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return errorResponse(res, 400, 'Role name already exists');
    }
    next(error);
  }
};

export const getAllRoles = async (req, res, next) => {
  try {
    const roles = await roleService.getAllRoles();
    return successResponse(res, 200, 'Roles fetched successfully', roles);
  } catch (error) {
    next(error);
  }
};

export const getRoleById = async (req, res, next) => {
  try {
    const role = await roleService.getRoleById(req.params.id);
    if (!role) {
      return errorResponse(res, 404, 'Role not found');
    }
    return successResponse(res, 200, 'Role fetched successfully', role);
  } catch (error) {
    next(error);
  }
};

export const updateRole = async (req, res, next) => {
  try {
    const role = await roleService.updateRole(req.params.id, req.body);
    if (!role) {
      return errorResponse(res, 404, 'Role not found');
    }
    return successResponse(res, 200, 'Role updated successfully', role);
  } catch (error) {
    next(error);
  }
};

export const deleteRole = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const role = await roleService.softDeleteRole(req.params.id, deletedRemarks, updated_by);
    if (!role) {
      return errorResponse(res, 404, 'Role not found');
    }
    return successResponse(res, 200, 'Role deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};
