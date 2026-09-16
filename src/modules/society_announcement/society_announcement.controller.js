import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyAnnouncementService from './society_announcement.service.js';
import { getImageUrl } from '../../utils/fileUpload.js';

export const createAnnouncement = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.body.society_id;
    const announcement = await societyAnnouncementService.createAnnouncement(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Society announcement created successfully', announcement);
  } catch (error) {
    return next(error);
  }
};

export const getAllAnnouncements = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const result = await societyAnnouncementService.getAllAnnouncements(societyId, req.query);
    return successResponse(res, 200, 'Society announcements retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

export const getAnnouncementById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const announcement = await societyAnnouncementService.getAnnouncementById(req.params.id, societyId);
    if (!announcement) return errorResponse(res, 404, 'Society announcement not found');
    return successResponse(res, 200, 'Society announcement retrieved successfully', announcement);
  } catch (error) {
    return next(error);
  }
};

export const updateAnnouncement = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const announcement = await societyAnnouncementService.updateAnnouncement(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!announcement) return errorResponse(res, 404, 'Society announcement not found');
    return successResponse(res, 200, 'Society announcement updated successfully', announcement);
  } catch (error) {
    return next(error);
  }
};

export const archiveAnnouncement = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const announcement = await societyAnnouncementService.updateAnnouncement(
      req.params.id,
      societyId,
      { status: 'archived' },
      actorUserId,
      {
        requestId: req.correlationId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );
    if (!announcement) return errorResponse(res, 404, 'Society announcement not found');
    return successResponse(res, 200, 'Society announcement archived successfully', announcement);
  } catch (error) {
    return next(error);
  }
};

export const deleteAnnouncement = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const announcement = await societyAnnouncementService.softDeleteAnnouncement(req.params.id, societyId, req.body?.deletedRemarks, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!announcement) return errorResponse(res, 404, 'Society announcement not found');
    return successResponse(res, 200, 'Society announcement deleted successfully');
  } catch (error) {
    return next(error);
  }
};

export const uploadAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No file uploaded. Use form field "file"');
    }
    const fileUrl = getImageUrl(req, req.file, 'announcements');
    return successResponse(res, 200, 'Attachment uploaded successfully', {
      file_url: fileUrl,
      file_name: req.file.originalname,
      file_type: req.file.mimetype,
      file_size: req.file.size,
    });
  } catch (error) {
    return next(error);
  }
};

export const bulkDeleteAnnouncements = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const { ids, deletedRemarks } = req.body;
    const result = await societyAnnouncementService.bulkDeleteAnnouncements(
      ids,
      societyId,
      deletedRemarks,
      actorUserId,
      {
        requestId: req.correlationId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );
    return successResponse(res, 200, `Successfully deleted ${result.count} announcement(s)`, result);
  } catch (error) {
    return next(error);
  }
};

