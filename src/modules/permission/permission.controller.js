import { successResponse, errorResponse } from '../../utils/response.js';
import * as permissionService from './permission.service.js';

export const getAllPermissions = async (req, res, next) => {
  try {
    const { module, search } = req.query;
    const permissions = await permissionService.getAllPermissions({ module, search });
    return successResponse(res, 200, 'Permissions fetched successfully', permissions);
  } catch (error) {
    next(error);
  }
};

export const getPermissionById = async (req, res, next) => {
  try {
    const permission = await permissionService.getPermissionById(req.params.id);
    if (!permission) {
      return errorResponse(res, 404, 'Permission not found');
    }
    return successResponse(res, 200, 'Permission fetched successfully', permission);
  } catch (error) {
    next(error);
  }
};

export const createPermission = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const permission = await permissionService.createPermission(req.body, actorId);
    return successResponse(res, 201, 'Permission created successfully', permission);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return errorResponse(res, 400, 'Permission code already exists');
    }
    next(error);
  }
};

export const updatePermission = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const permission = await permissionService.updatePermission(req.params.id, req.body, actorId);
    if (!permission) {
      return errorResponse(res, 404, 'Permission not found');
    }
    return successResponse(res, 200, 'Permission updated successfully', permission);
  } catch (error) {
    if (error.message.includes('system permission')) {
      return errorResponse(res, 400, error.message);
    }
    next(error);
  }
};

export const deletePermission = async (req, res, next) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    await permissionService.deletePermission(req.params.id, actorId);
    return successResponse(res, 200, 'Permission deleted successfully', null);
  } catch (error) {
    if (error.message.includes('System permissions cannot be deleted')) {
      return errorResponse(res, 400, error.message);
    }
    next(error);
  }
};

export const getMyPermissions = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const effective = await permissionService.getUserEffectivePermissions(userId);
    return successResponse(res, 200, 'User permissions resolved successfully', {
      userId,
      isSuperAdmin: effective.isSuperAdmin,
      isGlobalAdmin: effective.isGlobalAdmin,
      roles: effective.roles,
      permissions: Array.from(effective.permissions),
      directAllows: Array.from(effective.directAllows),
      directDenies: Array.from(effective.directDenies),
    });
  } catch (error) {
    next(error);
  }
};

export const checkPermission = async (req, res, next) => {
  try {
    const { permission, context } = req.body;
    if (!permission) {
      return errorResponse(res, 400, 'Permission code is required');
    }
    const result = await permissionService.authorize(req.user, permission, context || {});
    return successResponse(res, 200, 'Authorization evaluated', result);
  } catch (error) {
    next(error);
  }
};
