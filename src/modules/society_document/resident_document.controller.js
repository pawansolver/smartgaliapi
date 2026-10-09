import * as residentDocumentService from './resident_document.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import path from 'path';
import fs from 'fs';
import env from '../../config/env.js';

export const uploadResidentDocument = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.body.society_id;
    const userId = req.user.userId;

    const docData = { ...req.body };
    if (req.file) {
      docData.file_url = `/uploads/society/${req.file.filename}`;
      docData.file_type = req.file.mimetype;
      docData.file_size = req.file.size;
    }

    if (!docData.file_url) {
      return errorResponse(res, 400, 'Document file is required');
    }

    const document = await residentDocumentService.uploadResidentDocument(societyId, userId, docData, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, 201, 'Personal document uploaded successfully to vault', document);
  } catch (error) {
    next(error);
  }
};

export const getMyDocuments = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.query.society_id;
    const userId = req.user.userId;

    const result = await residentDocumentService.getMyResidentDocuments(societyId, userId, req.query);
    return successResponse(res, 200, 'Resident documents retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    next(error);
  }
};

export const getSharedDocuments = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.query.society_id;
    const callerUser = req.user;
    const callerRole = req.societyRole || req.user.role;

    const result = await residentDocumentService.getSharedResidentDocuments(societyId, callerUser, callerRole, req.query);
    return successResponse(res, 200, 'Shared resident documents retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    next(error);
  }
};

export const getDocumentById = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.query.society_id;
    const id = req.params.id;
    const callerUser = req.user;
    const callerRole = req.societyRole || req.user.role;

    const document = await residentDocumentService.getResidentDocumentById(id, societyId, callerUser, callerRole);
    if (!document) {
      return errorResponse(res, 404, 'Personal document not found');
    }

    return successResponse(res, 200, 'Personal document retrieved successfully', document);
  } catch (error) {
    next(error);
  }
};

export const shareForVerification = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.body.society_id;
    const id = req.params.id;
    const userId = req.user.userId;

    const document = await residentDocumentService.shareForVerification(id, societyId, userId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (!document) {
      return errorResponse(res, 404, 'Personal document not found');
    }

    return successResponse(res, 200, 'Personal document shared for society verification', document);
  } catch (error) {
    next(error);
  }
};

export const verifyResidentDocument = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.body.society_id;
    const id = req.params.id;
    const verifierUserId = req.user.userId;
    const callerUser = req.user;
    const callerRole = req.societyRole || req.user.role;

    const document = await residentDocumentService.verifyResidentDocument(
      id,
      societyId,
      verifierUserId,
      callerUser,
      callerRole,
      req.body,
      {
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    if (!document) {
      return errorResponse(res, 404, 'Personal document not found');
    }

    return successResponse(res, 200, `Document verification status updated to ${req.body.status}`, document);
  } catch (error) {
    next(error);
  }
};

export const deleteResidentDocument = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.query.society_id;
    const id = req.params.id;
    const userId = req.user.userId;

    const success = await residentDocumentService.deleteResidentDocument(id, societyId, userId, {
      remarks: req.body.remarks,
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (!success) {
      return errorResponse(res, 404, 'Personal document not found');
    }

    return successResponse(res, 200, 'Personal document deleted successfully from vault', { success: true });
  } catch (error) {
    next(error);
  }
};

export const downloadResidentDocument = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.query.society_id;
    const id = req.params.id;
    const callerUser = req.user;
    const callerRole = req.societyRole || req.user.role;

    const document = await residentDocumentService.getResidentDocumentById(id, societyId, callerUser, callerRole);
    if (!document) {
      return errorResponse(res, 404, 'Document not found');
    }

    // Resolve local file path
    const fileUrl = document.file_url;
    const relativePath = fileUrl.startsWith('/') ? fileUrl.slice(1) : fileUrl;
    const absolutePath = path.resolve(env.uploadsPath, '..', relativePath);

    if (!fs.existsSync(absolutePath)) {
      return errorResponse(res, 404, 'Physical file not found on server');
    }

    return res.download(absolutePath, path.basename(absolutePath));
  } catch (error) {
    next(error);
  }
};
