import { successResponse, errorResponse } from '../../utils/response.js';
import { getImageUrl } from '../../utils/fileUpload.js';
import * as userService from './user.service.js';
import bcrypt from 'bcrypt';

export const createUser = async (req, res, next) => {
  try {
    const userData = { ...req.body };
    
    // Hash password if provided
    if (userData.password) {
      userData.password = await bcrypt.hash(userData.password, 10);
    }

    // Set profile_image path if a file was uploaded
    if (req.file) {
      userData.profile_image = getImageUrl(req, req.file, 'user');
    }

    const user = await userService.createUser(userData);
    
    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.password;

    return successResponse(res, 201, 'User created successfully', userResponse);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return errorResponse(res, 400, 'Email already exists');
    }
    next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const roleName = req.query.roleName;
    let users;
    
    if (roleName) {
      users = await userService.getUsersByRole(roleName);
    } else {
      users = await userService.getAllUsers();
    }
    
    // Remove passwords from response
    const usersResponse = users.map(user => {
      const userJson = user.toJSON();
      delete userJson.password;
      return userJson;
    });

    return successResponse(res, 200, 'Users fetched successfully', usersResponse);
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    const userResponse = user.toJSON();
    delete userResponse.password;

    return successResponse(res, 200, 'User fetched successfully', userResponse);
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const updateData = { ...req.body };

    // Hash new password if provided
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    // Set new profile_image path if a new file was uploaded
    if (req.file) {
      updateData.profile_image = getImageUrl(req, req.file, 'user');
    }

    const user = await userService.updateUser(req.params.id, updateData);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    const userResponse = user.toJSON();
    delete userResponse.password;

    return successResponse(res, 200, 'User updated successfully', userResponse);
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const user = await userService.softDeleteUser(req.params.id, deletedRemarks, updated_by);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }
    return successResponse(res, 200, 'User deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const blockUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;
    if (Number(targetUserId) === Number(currentUserId)) {
      return errorResponse(res, 400, 'You cannot block yourself.');
    }
    const { default: sequelize } = await import('../../config/db.js');
    await sequelize.query(
      `INSERT IGNORE INTO user_blocks (user_id, blocked_user_id, created_at)
       VALUES (?, ?, NOW())`,
      { replacements: [currentUserId, targetUserId] }
    );
    return successResponse(res, 200, 'User blocked successfully', null);
  } catch (error) {
    next(error);
  }
};

export const unblockUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;
    const { default: sequelize } = await import('../../config/db.js');
    await sequelize.query(
      `DELETE FROM user_blocks WHERE user_id = ? AND blocked_user_id = ?`,
      { replacements: [currentUserId, targetUserId] }
    );
    return successResponse(res, 200, 'User unblocked successfully', null);
  } catch (error) {
    next(error);
  }
};

export const muteUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;
    if (Number(targetUserId) === Number(currentUserId)) {
      return errorResponse(res, 400, 'You cannot mute yourself.');
    }
    const { default: sequelize } = await import('../../config/db.js');
    await sequelize.query(
      `INSERT IGNORE INTO user_mutes (user_id, muted_user_id, created_at)
       VALUES (?, ?, NOW())`,
      { replacements: [currentUserId, targetUserId] }
    );
    return successResponse(res, 200, 'User muted successfully', null);
  } catch (error) {
    next(error);
  }
};

export const unmuteUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.id;
    const { default: sequelize } = await import('../../config/db.js');
    await sequelize.query(
      `DELETE FROM user_mutes WHERE user_id = ? AND muted_user_id = ?`,
      { replacements: [currentUserId, targetUserId] }
    );
    return successResponse(res, 200, 'User unmuted successfully', null);
  } catch (error) {
    next(error);
  }
};

export const getPendingUsers = async (req, res, next) => {
  try {
    const users = await userService.getPendingVerifications();
    return successResponse(res, 200, 'Pending users fetched successfully', users);
  } catch (error) {
    next(error);
  }
};

export const getBlockedUsersList = async (req, res, next) => {
  try {
    const users = await userService.getBlockedUsers();
    return successResponse(res, 200, 'Blocked users fetched successfully', users);
  } catch (error) {
    next(error);
  }
};

export const verifyUser = async (req, res, next) => {
  try {
    const user = await userService.verifyUser(req.params.id);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }
    return successResponse(res, 200, 'User verified successfully', user);
  } catch (error) {
    next(error);
  }
};


