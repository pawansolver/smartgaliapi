import * as societyDocumentService from './society_document.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const createDocument = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.societyContext?.societyId || req.society?.id || req.body?.society_id || req.query?.society_id;
    const userId = req.user.id || req.user.userId;

    const docData = { ...req.body };
    if (req.file) {
      docData.file_url = `/uploads/society/${req.file.filename}`;
      docData.file_type = req.file.mimetype;
      docData.file_size = req.file.size;
    }

    const document = await societyDocumentService.createDocument(societyId, userId, docData, req.user, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, 201, 'Document uploaded successfully', document);
  } catch (error) {
    next(error);
  }
};

export const getAllDocuments = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.societyContext?.societyId || req.society?.id || req.query.society_id;
    const callerUser = req.user;
    let callerRole = req.societyRole || req.societyContext?.role || req.societyMembership?.role || req.user?.role || 'resident';

    // Support simulated role exploration from Flutter client
    const simulatedRole = (req.headers['x-simulated-role'] || req.query.role || '').toLowerCase().trim();
    if (simulatedRole && (callerRole === 'admin' || callerRole === 'owner' || callerRole === 'superadmin')) {
      callerRole = simulatedRole;
    }

    const result = await societyDocumentService.getAllDocuments(societyId, req.query, callerUser, callerRole);
    return successResponse(res, 200, 'Documents retrieved successfully', result.data, {
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
    const societyId = req.societyId || req.societyContext?.societyId || req.society?.id || req.query.society_id;
    const id = req.params.id;
    const callerUser = req.user;
    let callerRole = req.societyRole || req.societyContext?.role || req.societyMembership?.role || req.user?.role || 'resident';

    const simulatedRole = (req.headers['x-simulated-role'] || req.query.role || '').toLowerCase().trim();
    if (simulatedRole && (callerRole === 'admin' || callerRole === 'owner' || callerRole === 'superadmin')) {
      callerRole = simulatedRole;
    }

    const document = await societyDocumentService.getDocumentById(id, societyId, callerUser, callerRole);
    if (!document) {
      return errorResponse(res, 404, 'Document not found');
    }

    return successResponse(res, 200, 'Document retrieved successfully', document);
  } catch (error) {
    next(error);
  }
};

export const updateDocument = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.societyContext?.societyId || req.document?.society_id || req.headers["x-society-id"] || req.body.society_id;
    const id = req.params.id;
    const userId = req.user.id || req.user.userId;

    const document = await societyDocumentService.updateDocument(id, societyId, req.body, userId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (!document) {
      return errorResponse(res, 404, 'Document not found');
    }

    return successResponse(res, 200, 'Document updated successfully', document);
  } catch (error) {
    next(error);
  }
};

export const createVersion = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.societyContext?.societyId || req.society?.id || req.body?.society_id || req.query?.society_id;
    const id = req.params.id;
    const userId = req.user.id || req.user.userId;

    const versionData = { ...req.body };
    if (req.file) {
      versionData.file_url = `/uploads/society/${req.file.filename}`;
      versionData.file_type = req.file.mimetype;
      versionData.file_size = req.file.size;
    }

    const result = await societyDocumentService.createVersion(id, societyId, versionData, userId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (!result) {
      return errorResponse(res, 404, 'Document not found');
    }

    return successResponse(res, 201, 'New document version created successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getVersions = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.societyContext?.societyId || req.document?.society_id || req.headers["x-society-id"] || req.query.society_id;
    const id = req.params.id;

    const versions = await societyDocumentService.getVersions(id, societyId);
    return successResponse(res, 200, 'Document versions retrieved successfully', versions);
  } catch (error) {
    next(error);
  }
};

export const updateDocumentStatus = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.societyContext?.societyId || req.document?.society_id || req.headers["x-society-id"] || req.body.society_id;
    const id = req.params.id;
    const userId = req.user.id || req.user.userId;
    const { status, reason } = req.body;

    const document = await societyDocumentService.updateDocumentStatus(id, societyId, status, userId, req.user, {
      reason,
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (!document) {
      return errorResponse(res, 404, 'Document not found');
    }

    return successResponse(res, 200, `Document status updated to ${status}`, document);
  } catch (error) {
    next(error);
  }
};

export const acknowledgeDocument = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.societyContext?.societyId || req.document?.society_id || req.headers["x-society-id"] || req.body.society_id;
    const id = req.params.id;
    const userId = req.user.id || req.user.userId;

    const result = await societyDocumentService.acknowledgeDocument(id, societyId, userId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return successResponse(res, 200, 'Document acknowledged successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getAcknowledgements = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.societyContext?.societyId || req.document?.society_id || req.headers["x-society-id"] || req.query.society_id;
    const id = req.params.id;

    const result = await societyDocumentService.getAcknowledgements(id, societyId);
    return successResponse(res, 200, 'Acknowledgements retrieved successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getAuditHistory = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.societyContext?.societyId || req.document?.society_id || req.headers["x-society-id"] || req.query.society_id;
    const id = req.params.id;

    const audits = await societyDocumentService.getAuditHistory(id, societyId);
    return successResponse(res, 200, 'Document audit trail retrieved successfully', audits);
  } catch (error) {
    next(error);
  }
};

export const deleteDocument = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.societyContext?.societyId || req.document?.society_id || req.headers["x-society-id"] || req.query.society_id;
    const id = req.params.id;
    const userId = req.user.id || req.user.userId;

    const deleted = await societyDocumentService.deleteDocument(id, societyId, userId, {
      remarks: req.body.remarks,
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (!deleted) {
      return errorResponse(res, 404, 'Document not found');
    }

    return successResponse(res, 200, 'Document deleted successfully', { success: true });
  } catch (error) {
    next(error);
  }
};

export const downloadDocument = async (req, res, next) => {
  try {
    const societyId = req.societyId || req.societyContext?.societyId || req.document?.society_id || req.headers["x-society-id"] || req.query.society_id;
    const id = req.params.id;
    const callerUser = req.user;
    const callerRole = req.societyRole || req.user.role;

    const document = await societyDocumentService.getDocumentById(id, societyId, callerUser, callerRole);
    if (!document) {
      return errorResponse(res, 404, 'Document not found');
    }

    const fileUrl = document.file_url;
    const relativePath = fileUrl.startsWith('/') ? fileUrl.slice(1) : fileUrl;
    const pathModule = await import('path');
    const fsModule = await import('fs');
    const envModule = (await import('../../config/env.js')).default;
    const absolutePath = pathModule.default.resolve(envModule.uploadsPath, '..', relativePath);

    if (!fsModule.default.existsSync(absolutePath)) {
      return errorResponse(res, 404, 'Physical document file not found on server');
    }

    return res.download(absolutePath, pathModule.default.basename(absolutePath));
  } catch (error) {
    next(error);
  }
};
