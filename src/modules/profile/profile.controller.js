import { successResponse, errorResponse } from '../../utils/response.js';
import { uploadImage, getImageUrl, removeLocalUpload } from '../../utils/fileUpload.js';
import * as profileService from './profile.service.js';

// ── Profile aggregate ────────────────────────────────────────
export const getMe = async (req, res, next) => {
  try {
    const profile = await profileService.getMyProfile(req.user.id);
    if (!profile) return errorResponse(res, 404, 'Profile not found.');
    return successResponse(res, 200, 'Profile fetched successfully.', profile);
  } catch (error) {
    next(error);
  }
};

export const updateMe = async (req, res, next) => {
  try {
    const result = await profileService.updateMyProfile(req.user.id, req.body);
    if (result.error) return errorResponse(res, result.status || 409, result.error);
    return successResponse(res, 200, 'Profile updated successfully.', result.data);
  } catch (error) {
    next(error);
  }
};

// ── Avatar upload ────────────────────────────────────────────
export const uploadAvatar = [
  uploadImage('avatars').single('avatar'),
  async (req, res, next) => {
    let newAvatarUrl;
    try {
      if (!req.file) {
        return errorResponse(res, 400, "No image provided. Send multipart/form-data with field name 'avatar'.");
      }
      newAvatarUrl = getImageUrl(req, req.file, 'avatars');
      const previousProfile = await profileService.getMyProfile(req.user.id);
      const result = await profileService.updateMyProfile(req.user.id, { avatarUrl: newAvatarUrl });
      if (result.error) {
        await removeLocalUpload(newAvatarUrl);
        return errorResponse(res, result.status || 500, result.error);
      }

      if (previousProfile?.avatarUrl && previousProfile.avatarUrl !== newAvatarUrl) {
        try {
          await removeLocalUpload(previousProfile.avatarUrl);
        } catch (cleanupError) {
          console.error('Failed to remove previous local avatar:', cleanupError.message);
        }
      }
      return successResponse(res, 200, 'Avatar updated successfully.', {
        avatarUrl: newAvatarUrl,
        profile: result.data,
      });
    } catch (error) {
      if (newAvatarUrl) {
        try {
          await removeLocalUpload(newAvatarUrl);
        } catch (cleanupError) {
          console.error('Failed to remove unsuccessful avatar upload:', cleanupError.message);
        }
      }
      next(error);
    }
  },
];

// ── Addresses ────────────────────────────────────────────────
export const listAddresses = async (req, res, next) => {
  try {
    const addresses = await profileService.getAddresses(req.user.id);
    return successResponse(res, 200, 'Addresses fetched successfully.', addresses);
  } catch (error) {
    next(error);
  }
};

export const addAddress = async (req, res, next) => {
  try {
    const address = await profileService.createAddress(req.user.id, req.body);
    if (!address) return errorResponse(res, 404, 'Active user not found.');
    return successResponse(res, 201, 'Address added successfully.', address);
  } catch (error) {
    next(error);
  }
};

export const editAddress = async (req, res, next) => {
  try {
    const address = await profileService.updateAddress(req.user.id, req.params.id, req.body);
    if (!address) return errorResponse(res, 404, 'Address not found.');
    return successResponse(res, 200, 'Address updated successfully.', address);
  } catch (error) {
    next(error);
  }
};

export const makeAddressDefault = async (req, res, next) => {
  try {
    const address = await profileService.setDefaultAddress(req.user.id, req.params.id);
    if (!address) return errorResponse(res, 404, 'Address not found.');
    return successResponse(res, 200, 'Default address set successfully.', address);
  } catch (error) {
    next(error);
  }
};

export const removeAddress = async (req, res, next) => {
  try {
    const deleted = await profileService.deleteAddress(req.user.id, req.params.id);
    if (!deleted) return errorResponse(res, 404, 'Address not found.');
    return successResponse(res, 200, 'Address deleted successfully.', null);
  } catch (error) {
    next(error);
  }
};

export const getSociety = async (req, res, next) => {
  try {
    const society = await profileService.getMySociety(req.user.id);
    return successResponse(res, 200, 'Society fetched successfully.', society);
  } catch (error) {
    next(error);
  }
};

export const createSupportTicket = async (req, res, next) => {
  try {
    const ticket = await profileService.createSupportTicket(req.user.id, req.body);
    if (!ticket) return errorResponse(res, 404, 'Active user not found.');
    return successResponse(res, 201, 'Support ticket submitted successfully.', ticket);
  } catch (error) {
    next(error);
  }
};

export const createDataExportRequest = async (req, res, next) => {
  try {
    const result = await profileService.createDataExportRequest(req.user.id);
    if (result.error) return errorResponse(res, result.status || 409, result.error, result.data);
    return successResponse(res, 201, 'Data export request submitted successfully.', result.data);
  } catch (error) {
    next(error);
  }
};

// ── Notification preferences ─────────────────────────────────
export const getNotificationPreferences = async (req, res, next) => {
  try {
    const prefs = await profileService.getNotificationPreferences(req.user.id);
    return successResponse(res, 200, 'Notification preferences fetched successfully.', prefs);
  } catch (error) {
    next(error);
  }
};

export const updateNotificationPreferences = async (req, res, next) => {
  try {
    const prefs = await profileService.updateNotificationPreferences(req.user.id, req.body);
    return successResponse(res, 200, 'Notification preferences updated successfully.', prefs);
  } catch (error) {
    next(error);
  }
};

// ── Privacy settings ─────────────────────────────────────────
export const getPrivacySettings = async (req, res, next) => {
  try {
    const settings = await profileService.getPrivacySettings(req.user.id);
    return successResponse(res, 200, 'Privacy settings fetched successfully.', settings);
  } catch (error) {
    next(error);
  }
};

export const updatePrivacySettings = async (req, res, next) => {
  try {
    const settings = await profileService.updatePrivacySettings(req.user.id, req.body);
    return successResponse(res, 200, 'Privacy settings updated successfully.', settings);
  } catch (error) {
    next(error);
  }
};

// ── Change password ──────────────────────────────────────────
export const changePassword = async (req, res, next) => {
  try {
    const result = await profileService.changePassword(req.user.id, req.body);
    if (result.error) return errorResponse(res, result.status || 400, result.error);
    return successResponse(res, 200, 'Password updated successfully.', null);
  } catch (error) {
    next(error);
  }
};

// ── Delete account ───────────────────────────────────────────
export const deleteAccount = async (req, res, next) => {
  try {
    const result = await profileService.deleteAccount(req.user.id, req.body);
    if (result.error) return errorResponse(res, result.status || 400, result.error);
    return successResponse(res, 200, 'Account deleted successfully.', null);
  } catch (error) {
    next(error);
  }
};
