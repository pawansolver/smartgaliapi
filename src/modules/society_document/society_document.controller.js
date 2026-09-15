import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyDocumentService from './society_document.service.js';
import env from '../../config/env.js';

export const createDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.body.society_id;

    if (!req.file && !req.body.file_url) {
      return errorResponse(res, 400, 'Document file or file_url is required');
    }

    const fileUrl = req.file
      ? `${env.publicMediaOrigin}/uploads/society/${req.file.filename}`
      : req.body.file_url;

    const payload = {
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      file_url: fileUrl,
      file_type: req.file ? req.file.mimetype : req.body.file_type,
      file_size: req.file ? req.file.size : req.body.file_size,
    };

    const doc = await societyDocumentService.createDocument(societyId, userId, payload, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return successResponse(res, 201, 'Society document uploaded successfully', doc);
  } catch (error) {
    return next(error);
  }
};

export const getAllDocuments = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const result = await societyDocumentService.getAllDocuments(societyId, req.query);
    return successResponse(res, 200, 'Society documents retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

export const getDocumentById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const doc = await societyDocumentService.getDocumentById(req.params.id, societyId);
    if (!doc) return errorResponse(res, 404, 'Society document not found');
    return successResponse(res, 200, 'Society document retrieved successfully', doc);
  } catch (error) {
    return next(error);
  }
};

export const updateDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const doc = await societyDocumentService.updateDocument(req.params.id, societyId, req.body, userId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!doc) return errorResponse(res, 404, 'Society document not found');
    return successResponse(res, 200, 'Society document updated successfully', doc);
  } catch (error) {
    return next(error);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const deleted = await societyDocumentService.deleteDocument(req.params.id, societyId, userId, {
      remarks: req.body?.remarks,
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!deleted) return errorResponse(res, 404, 'Society document not found');
    return successResponse(res, 200, 'Society document deleted successfully');
  } catch (error) {
    return next(error);
  }
};
