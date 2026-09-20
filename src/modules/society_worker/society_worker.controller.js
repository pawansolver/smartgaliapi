import { successResponse, errorResponse } from '../../utils/response.js';
import * as workerService from './society_worker.service.js';
import SocietyWorkerAuthorization from './society_worker_authorization.model.js';

export const getAuthorizedWorkers = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    if (!societyId) return errorResponse(res, 400, 'society_id is required');
    const workers = await workerService.getAuthorizedWorkers(societyId);
    return successResponse(res, 200, 'Authorized workers fetched', workers);
  } catch (err) { return next(err); }
};

export const getEligibleAssignees = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const { category } = req.query;
    if (!societyId) return errorResponse(res, 400, 'society_id is required');
    const result = await workerService.getEligibleAssignees(societyId, category);
    return successResponse(res, 200, 'Eligible assignees fetched', result);
  } catch (err) { return next(err); }
};

export const authorizeWorker = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.body.society_id;
    if (!societyId) return errorResponse(res, 400, 'society_id is required');
    if (!req.body.user_id) return errorResponse(res, 400, 'user_id is required');
    const auth = await workerService.authorizeWorker(societyId, req.body, actorUserId, {
      requestId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Worker authorized successfully', auth);
  } catch (err) { return next(err); }
};

export const updateWorkerAuthorization = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const { id } = req.params;
    const existing = await SocietyWorkerAuthorization.findOne({ where: { id, society_id: societyId, is_deleted: false } });
    if (!existing) return errorResponse(res, 404, 'Worker authorization not found');
    const auth = await workerService.authorizeWorker(societyId, { user_id: existing.user_id, ...req.body }, actorUserId, {
      requestId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Worker authorization updated', auth);
  } catch (err) { return next(err); }
};

export const revokeWorkerAuthorization = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const { id } = req.params;
    const auth = await workerService.revokeWorkerAuthorization(id, societyId, req.body?.reason, actorUserId, {
      requestId: req.correlationId, ip: req.ip, userAgent: req.headers['user-agent'],
    });
    if (!auth) return errorResponse(res, 404, 'Worker authorization not found');
    return successResponse(res, 200, 'Worker authorization revoked', auth);
  } catch (err) { return next(err); }
};
