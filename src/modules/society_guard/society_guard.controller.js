import * as guardService from './society_guard.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { getImageUrl } from '../../utils/fileUpload.js';

export const onboardGuard = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const guard = await guardService.onboardGuard(societyId, actorUserId, req.body, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 201, 'Guard onboarded successfully', guard);
  } catch (err) {
    next(err);
  }
};

export const getGuards = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const isOwnerOrSuperAdmin = req.societyContext?.isOwner || req.societyContext?.isSuperAdmin;
    const list = await guardService.getGuards(societyId, req.query, actorUserId, isOwnerOrSuperAdmin);
    return successResponse(res, 200, 'Guards retrieved successfully', list);
  } catch (err) {
    next(err);
  }
};

export const getGuardById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const isOwnerOrSuperAdmin = req.societyContext?.isOwner || req.societyContext?.isSuperAdmin;
    const guard = await guardService.getGuardById(req.params.id, societyId, actorUserId, isOwnerOrSuperAdmin);
    if (!guard) return errorResponse(res, 404, 'Guard authorization not found');
    return successResponse(res, 200, 'Guard details retrieved', guard);
  } catch (err) {
    next(err);
  }
};

export const uploadPhoto = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.headers['x-society-id'] || req.query.society_id;
    const actorUserId = req.user?.id || req.user?.userId;
    let photoUrl = req.body?.photo_url || req.body?.profile_photo_url;
    if (req.file) {
      photoUrl = getImageUrl(req, req.file, 'guards');
    }
    if (!photoUrl) {
      return errorResponse(res, 400, 'Photo file or photo_url is required');
    }

    // If no guard ID provided or id is 'upload', return uploaded photo url directly
    if (!req.params.id || req.params.id === 'upload' || isNaN(Number(req.params.id))) {
      return successResponse(res, 200, 'Guard photo uploaded successfully', {
        photo_url: photoUrl,
        profile_photo_url: photoUrl,
      });
    }

    const updated = await guardService.updateGuardPhoto(req.params.id, societyId, photoUrl, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!updated) return errorResponse(res, 404, 'Guard authorization not found');
    return successResponse(res, 200, 'Guard photo uploaded successfully', updated);
  } catch (err) {
    next(err);
  }
};

export const removePhoto = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const updated = await guardService.removeGuardPhoto(req.params.id, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!updated) return errorResponse(res, 404, 'Guard authorization not found');
    return successResponse(res, 200, 'Guard photo removed successfully', updated);
  } catch (err) {
    next(err);
  }
};

export const uploadIdDocument = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.headers['x-society-id'] || req.query.society_id;
    const actorUserId = req.user?.id || req.user?.userId;
    let documentUrl = req.body?.document_url || req.body?.id_document_url;
    if (req.file) {
      documentUrl = getImageUrl(req, req.file, 'guard_documents');
    }
    if (!documentUrl && !req.body?.id_number) {
      return errorResponse(res, 400, 'Document file or ID details required');
    }

    // If no guard ID provided or id is 'upload', return uploaded document url directly
    if (!req.params.id || req.params.id === 'upload' || isNaN(Number(req.params.id))) {
      return successResponse(res, 200, 'ID document uploaded successfully', {
        document_url: documentUrl,
        id_document_url: documentUrl,
      });
    }

    const updated = await guardService.uploadGuardIdDocument(
      req.params.id,
      societyId,
      {
        idType: req.body?.id_type,
        idNumber: req.body?.id_number,
        documentUrl,
      },
      actorUserId,
      {
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      }
    );
    if (!updated) return errorResponse(res, 404, 'Guard authorization not found');
    return successResponse(res, 200, 'ID document uploaded successfully', updated);
  } catch (err) {
    next(err);
  }
};

export const verifyGuard = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const updated = await guardService.verifyGuard(req.params.id, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!updated) return errorResponse(res, 404, 'Guard authorization not found');
    return successResponse(res, 200, 'Guard identity verified successfully', updated);
  } catch (err) {
    next(err);
  }
};

export const rejectVerification = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const reason = req.body?.reason || req.body?.rejection_reason;
    const updated = await guardService.rejectGuardVerification(req.params.id, societyId, reason, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!updated) return errorResponse(res, 404, 'Guard authorization not found');
    return successResponse(res, 200, 'Guard verification rejected', updated);
  } catch (err) {
    next(err);
  }
};

export const updateGuardStatus = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const updated = await guardService.updateGuardStatus(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!updated) return errorResponse(res, 404, 'Guard not found');
    return successResponse(res, 200, 'Guard status updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

export const assignGateAndShift = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const assignment = await guardService.assignGuardGateAndShift(societyId, actorUserId, req.body, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return successResponse(res, 201, 'Guard assigned to gate and shift successfully', assignment);
  } catch (err) {
    next(err);
  }
};

export const getMyDuty = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const userId = req.user?.id || req.user?.userId;
    const duty = await guardService.getMyGuardDuty(userId, societyId);
    return successResponse(res, 200, 'Guard duty status', duty);
  } catch (err) {
    next(err);
  }
};

export const updateGuard = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const updated = await guardService.updateGuard(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!updated) return errorResponse(res, 404, 'Guard not found');
    return successResponse(res, 200, 'Guard updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

export const deleteGuard = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const actorUserId = req.user?.id || req.user?.userId;
    const deleted = await guardService.deleteGuard(req.params.id, societyId, actorUserId, {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    if (!deleted) return errorResponse(res, 404, 'Guard not found');
    return successResponse(res, 200, 'Guard deleted successfully');
  } catch (err) {
    next(err);
  }
};
