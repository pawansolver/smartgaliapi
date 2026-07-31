import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyAnnouncementService from './society_announcement.service.js';

export const createAnnouncement = async (req, res, next) => {
  try {
    const announcement = await societyAnnouncementService.createAnnouncement(req.body);
    return successResponse(res, 201, 'Society announcement created successfully', announcement);
  } catch (error) {
    next(error);
  }
};

export const getAllAnnouncements = async (req, res, next) => {
  try {
    const announcements = await societyAnnouncementService.getAllAnnouncements();
    return successResponse(res, 200, 'Society announcements fetched successfully', announcements);
  } catch (error) {
    next(error);
  }
};

export const getAnnouncementById = async (req, res, next) => {
  try {
    const announcement = await societyAnnouncementService.getAnnouncementById(req.params.id);
    if (!announcement) {
      return errorResponse(res, 404, 'Society announcement not found');
    }
    return successResponse(res, 200, 'Society announcement fetched successfully', announcement);
  } catch (error) {
    next(error);
  }
};

export const updateAnnouncement = async (req, res, next) => {
  try {
    const announcement = await societyAnnouncementService.updateAnnouncement(req.params.id, req.body);
    if (!announcement) {
      return errorResponse(res, 404, 'Society announcement not found');
    }
    return successResponse(res, 200, 'Society announcement updated successfully', announcement);
  } catch (error) {
    next(error);
  }
};

export const deleteAnnouncement = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const announcement = await societyAnnouncementService.softDeleteAnnouncement(req.params.id, deletedRemarks, updated_by);
    if (!announcement) {
      return errorResponse(res, 404, 'Society announcement not found');
    }
    return successResponse(res, 200, 'Society announcement deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteAnnouncements = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await societyAnnouncementService.bulkSoftDeleteAnnouncements(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Society announcements deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
