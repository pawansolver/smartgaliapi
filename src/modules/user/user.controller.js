import * as userService from './user.service.js';
import * as permissionService from '../permission/permission.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const createUser = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body);
    return successResponse(res, 201, 'User created successfully', user);
  } catch (error) {
    return next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    return successResponse(res, 200, 'Users fetched successfully', users);
  } catch (error) {
    return next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) return errorResponse(res, 404, 'User not found');
    return successResponse(res, 200, 'User fetched successfully', user);
  } catch (error) {
    return next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    if (!user) return errorResponse(res, 404, 'User not found');
    return successResponse(res, 200, 'User updated successfully', user);
  } catch (error) {
    return next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const user = await userService.softDeleteUser(req.params.id, req.body.deletedRemarks, req.user?.id);
    if (!user) return errorResponse(res, 404, 'User not found');
    return successResponse(res, 200, 'User deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const blockUser = async (req, res, next) => {
  try {
    const user = await userService.blockUser(req.params.id);
    if (!user) return errorResponse(res, 404, 'User not found');
    return successResponse(res, 200, 'User blocked successfully', user);
  } catch (error) {
    return next(error);
  }
};

export const unblockUser = async (req, res, next) => {
  try {
    const user = await userService.unblockUser(req.params.id);
    if (!user) return errorResponse(res, 404, 'User not found');
    return successResponse(res, 200, 'User unblocked successfully', user);
  } catch (error) {
    return next(error);
  }
};

export const verifyUser = async (req, res, next) => {
  try {
    const user = await userService.verifyUser(req.params.id);
    if (!user) return errorResponse(res, 404, 'User not found');
    return successResponse(res, 200, 'User verified successfully', user);
  } catch (error) {
    return next(error);
  }
};

export const muteUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, { is_muted: true });
    if (!user) return errorResponse(res, 404, 'User not found');
    return successResponse(res, 200, 'User muted successfully', user);
  } catch (error) {
    return next(error);
  }
};

export const unmuteUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, { is_muted: false });
    if (!user) return errorResponse(res, 404, 'User not found');
    return successResponse(res, 200, 'User unmuted successfully', user);
  } catch (error) {
    return next(error);
  }
};

export const getPendingUsers = async (req, res, next) => {
  try {
    const users = await userService.getPendingVerifications();
    return successResponse(res, 200, 'Pending users fetched successfully', users);
  } catch (error) {
    return next(error);
  }
};

export const getBlockedUsersList = async (req, res, next) => {
  try {
    const users = await userService.getBlockedUsers();
    return successResponse(res, 200, 'Blocked users fetched successfully', users);
  } catch (error) {
    return next(error);
  }
};

// PBAC User Role & Direct Permission Controllers
export const getUserRoles = async (req, res, next) => {
  try {
    const roles = await permissionService.getUserRoles(req.params.id);
    return successResponse(res, 200, 'User roles fetched successfully', roles);
  } catch (error) {
    return next(error);
  }
};

export const updateUserRoles = async (req, res, next) => {
  try {
    const roleIds = req.body.roleIds || req.body.roles || [];
    const roles = await permissionService.assignRolesToUser(req.params.id, roleIds, req.user);
    return successResponse(res, 200, 'User roles updated successfully', roles);
  } catch (error) {
    if (error.message.includes('Forbidden')) {
      return errorResponse(res, 403, error.message);
    }
    return next(error);
  }
};

export const getUserPermissions = async (req, res, next) => {
  try {
    const permissions = await permissionService.getUserDirectPermissions(req.params.id);
    return successResponse(res, 200, 'User direct permissions fetched successfully', permissions);
  } catch (error) {
    return next(error);
  }
};

export const updateUserPermissions = async (req, res, next) => {
  try {
    const assignments = req.body.permissions || req.body.assignments || [];
    const permissions = await permissionService.assignDirectUserPermissions(req.params.id, assignments, req.user);
    return successResponse(res, 200, 'User direct permissions updated successfully', permissions);
  } catch (error) {
    if (error.message.includes('Forbidden')) {
      return errorResponse(res, 403, error.message);
    }
    return next(error);
  }
};

export const deleteUserPermission = async (req, res, next) => {
  try {
    await permissionService.removeDirectUserPermission(req.params.id, req.params.permissionId, req.user);
    return successResponse(res, 200, 'User direct permission removed successfully');
  } catch (error) {
    if (error.message.includes('Forbidden')) {
      return errorResponse(res, 403, error.message);
    }
    return next(error);
  }
};

// Admin User Management Controllers (Super Admin Exclusive)
export const listAdminUsers = async (req, res, next) => {
  try {
    const admins = await userService.listAdminUsers();
    return successResponse(res, 200, 'Admin users fetched successfully', admins);
  } catch (error) {
    return next(error);
  }
};

export const createAdminUser = async (req, res, next) => {
  try {
    const admin = await userService.createAdminUser(req.body, req.user);
    return successResponse(res, 201, 'Admin user created successfully', admin);
  } catch (error) {
    if (error.message.includes('Forbidden')) {
      return errorResponse(res, 403, error.message);
    }
    return next(error);
  }
};

export const updateAdminUser = async (req, res, next) => {
  try {
    const admin = await userService.updateAdminUser(req.params.id, req.body, req.user);
    if (!admin) return errorResponse(res, 404, 'Admin user not found');
    return successResponse(res, 200, 'Admin user updated successfully', admin);
  } catch (error) {
    if (error.message.includes('Forbidden')) {
      return errorResponse(res, 403, error.message);
    }
    return next(error);
  }
};

export const deactivateAdminUser = async (req, res, next) => {
  try {
    const admin = await userService.deactivateAdminUser(req.params.id, req.user);
    if (!admin) return errorResponse(res, 404, 'Admin user not found');
    return successResponse(res, 200, 'Admin user deactivated successfully', admin);
  } catch (error) {
    if (error.message.includes('Forbidden')) {
      return errorResponse(res, 403, error.message);
    }
    return next(error);
  }
};
