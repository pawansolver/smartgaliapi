import { successResponse, errorResponse } from '../../utils/response.js';
import * as roleService from './role.service.js';
import * as permissionService from '../permission/permission.service.js';

export const createRole = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const role = await roleService.createRole(req.body, actorId);
    return successResponse(res, 201, 'Role created successfully', role);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return errorResponse(res, 400, 'Role name or role code already exists');
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
    const actorId = req.user?.id || req.user?.userId;
    const role = await roleService.updateRole(req.params.id, req.body, actorId);
    if (!role) {
      return errorResponse(res, 404, 'Role not found');
    }
    return successResponse(res, 200, 'Role updated successfully', role);
  } catch (error) {
    if (error.message.includes('protected system role')) {
      return errorResponse(res, 400, error.message);
    }
    next(error);
  }
};

export const deleteRole = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const { deletedRemarks } = req.body || {};
    await roleService.softDeleteRole(req.params.id, deletedRemarks, actorId);
    return successResponse(res, 200, 'Role deleted successfully', null);
  } catch (error) {
    if (error.message.includes('System roles cannot be deleted')) {
      return errorResponse(res, 400, error.message);
    }
    next(error);
  }
};

export const getRolePermissions = async (req, res, next) => {
  try {
    const permissions = await permissionService.getRolePermissions(req.params.id);
    return successResponse(res, 200, 'Role permissions fetched successfully', permissions);
  } catch (error) {
    next(error);
  }
};

export const updateRolePermissions = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const { permissionIds } = req.body;
    if (!Array.isArray(permissionIds)) {
      return errorResponse(res, 400, 'permissionIds must be an array of IDs');
    }
    const permissions = await permissionService.assignPermissionsToRole(req.params.id, permissionIds, actorId);
    return successResponse(res, 200, 'Role permissions updated successfully', permissions);
  } catch (error) {
    if (error.message.includes('Role not found')) {
      return errorResponse(res, 404, error.message);
    }
    next(error);
  }
};
