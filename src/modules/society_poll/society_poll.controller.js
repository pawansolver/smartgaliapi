import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyPollService from './society_poll.service.js';

export const createPoll = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.body.society_id;
    const poll = await societyPollService.createPoll(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Society poll created successfully', poll);
  } catch (error) {
    return next(error);
  }
};

export const getAllPolls = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const result = await societyPollService.getAllPolls(societyId, req.query, userId);
    return successResponse(res, 200, 'Society polls retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

export const getPollById = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const poll = await societyPollService.getPollById(req.params.id, societyId, userId);
    if (!poll) return errorResponse(res, 404, 'Society poll not found');
    return successResponse(res, 200, 'Society poll retrieved successfully', poll);
  } catch (error) {
    return next(error);
  }
};

export const votePoll = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const updatedPoll = await societyPollService.votePoll(req.params.id, societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Vote cast successfully', updatedPoll);
  } catch (error) {
    return next(error);
  }
};

export const updatePoll = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const poll = await societyPollService.updatePoll(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!poll) return errorResponse(res, 404, 'Society poll not found');
    return successResponse(res, 200, 'Society poll updated successfully', poll);
  } catch (error) {
    return next(error);
  }
};

export const updatePollStatus = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const poll = await societyPollService.updatePollStatus(req.params.id, societyId, req.body.status, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!poll) return errorResponse(res, 404, 'Society poll not found');
    return successResponse(res, 200, 'Society poll status updated successfully', poll);
  } catch (error) {
    return next(error);
  }
};

export const deletePoll = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const poll = await societyPollService.softDeletePoll(req.params.id, societyId, req.body?.deletedRemarks, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!poll) return errorResponse(res, 404, 'Society poll not found');
    return successResponse(res, 200, 'Society poll deleted successfully');
  } catch (error) {
    return next(error);
  }
};
