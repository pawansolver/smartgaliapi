import societyServiceAccessService from './society_service_access.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export class SocietyServiceAccessController {
  async requestAccess(req, res, next) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const { service_id, society_id, notes } = req.body;
      const result = await societyServiceAccessService.requestAccess({
        userId,
        serviceId: service_id,
        societyId: society_id,
        notes,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      });
      return successResponse(res, 201, 'Society service access requested successfully', result);
    } catch (error) {
      if (error.statusCode) {
        return errorResponse(res, error.statusCode, error.message, error.code);
      }
      return next(error);
    }
  }

  async getProviderRequests(req, res, next) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const { status, page, limit } = req.query;
      const result = await societyServiceAccessService.getProviderAccessRequests({
        userId,
        status,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });
      return successResponse(res, 200, 'Provider society access requests retrieved', result);
    } catch (error) {
      return next(error);
    }
  }

  async getSocietyRequests(req, res, next) {
    try {
      const societyId = req.societyId || req.query.society_id || req.headers?.['x-society-id'];
      if (!societyId) {
        return errorResponse(res, 400, 'Society ID is required', 'SOCIETY_ID_REQUIRED');
      }
      const { status, page, limit } = req.query;
      const result = await societyServiceAccessService.getSocietyAccessRequests({
        societyId: Number(societyId),
        status,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });
      return successResponse(res, 200, 'Society service access requests retrieved', result);
    } catch (error) {
      return next(error);
    }
  }

  async getAccessById(req, res, next) {
    try {
      const result = await societyServiceAccessService.getAccessById(Number(req.params.id));
      return successResponse(res, 200, 'Society service access details retrieved', result);
    } catch (error) {
      if (error.statusCode) {
        return errorResponse(res, error.statusCode, error.message, error.code);
      }
      return next(error);
    }
  }

  async approveAccess(req, res, next) {
    try {
      const reviewerUserId = req.user?.userId || req.user?.id;
      const isSuperAdmin = req.user?.userRole === 'super_admin' || req.user?.role === 'super_admin' || req.user?.user_role === 'super_admin';
      const societyId = req.societyId || req.headers?.['x-society-id'];
      const result = await societyServiceAccessService.approveAccess({
        accessId: Number(req.params.id),
        reviewerUserId,
        isSuperAdmin,
        societyId: societyId ? Number(societyId) : null,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      });
      return successResponse(res, 200, 'Provider service access approved successfully', result);
    } catch (error) {
      if (error.statusCode) {
        return errorResponse(res, error.statusCode, error.message, error.code);
      }
      return next(error);
    }
  }

  async rejectAccess(req, res, next) {
    try {
      const reviewerUserId = req.user?.userId || req.user?.id;
      const societyId = req.societyId || req.headers?.['x-society-id'];
      const { reason } = req.body;
      const result = await societyServiceAccessService.rejectAccess({
        accessId: Number(req.params.id),
        reviewerUserId,
        societyId: societyId ? Number(societyId) : null,
        rejectionReason: reason,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      });
      return successResponse(res, 200, 'Provider service access rejected', result);
    } catch (error) {
      if (error.statusCode) {
        return errorResponse(res, error.statusCode, error.message, error.code);
      }
      return next(error);
    }
  }

  async suspendAccess(req, res, next) {
    try {
      const reviewerUserId = req.user?.userId || req.user?.id;
      const societyId = req.societyId || req.headers?.['x-society-id'];
      const { reason } = req.body;
      const result = await societyServiceAccessService.suspendAccess({
        accessId: Number(req.params.id),
        reviewerUserId,
        societyId: societyId ? Number(societyId) : null,
        suspensionReason: reason,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      });
      return successResponse(res, 200, 'Provider service access suspended', result);
    } catch (error) {
      if (error.statusCode) {
        return errorResponse(res, error.statusCode, error.message, error.code);
      }
      return next(error);
    }
  }

  async revokeAccess(req, res, next) {
    try {
      const reviewerUserId = req.user?.userId || req.user?.id;
      const societyId = req.societyId || req.headers?.['x-society-id'];
      const { reason } = req.body;
      const result = await societyServiceAccessService.revokeAccess({
        accessId: Number(req.params.id),
        reviewerUserId,
        societyId: societyId ? Number(societyId) : null,
        reason,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
      });
      return successResponse(res, 200, 'Provider service access permanently revoked', result);
    } catch (error) {
      if (error.statusCode) {
        return errorResponse(res, error.statusCode, error.message, error.code);
      }
      return next(error);
    }
  }
}

export default new SocietyServiceAccessController();
