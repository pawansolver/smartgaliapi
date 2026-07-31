import { successResponse, errorResponse } from '../../utils/response.js';
import * as pollService from './society_poll.service.js';

export const createPoll = async (req, res, next) => {
  try {
    const poll = await pollService.createPoll(req.body);
    return successResponse(res, 201, 'Poll created successfully', poll);
  } catch (error) {
    next(error);
  }
};

export const getAllPolls = async (req, res, next) => {
  try {
    const polls = await pollService.getAllPolls();
    return successResponse(res, 200, 'Polls fetched successfully', polls);
  } catch (error) {
    next(error);
  }
};

export const getPollById = async (req, res, next) => {
  try {
    const poll = await pollService.getPollById(req.params.id);
    if (!poll) {
      return errorResponse(res, 404, 'Poll not found');
    }
    return successResponse(res, 200, 'Poll fetched successfully', poll);
  } catch (error) {
    next(error);
  }
};

export const updatePoll = async (req, res, next) => {
  try {
    const poll = await pollService.updatePoll(req.params.id, req.body);
    if (!poll) {
      return errorResponse(res, 404, 'Poll not found');
    }
    return successResponse(res, 200, 'Poll updated successfully', poll);
  } catch (error) {
    next(error);
  }
};

export const updatePollStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return errorResponse(res, 400, 'Status is required');
    const poll = await pollService.updatePollStatus(req.params.id, status);
    if (!poll) {
      return errorResponse(res, 404, 'Poll not found');
    }
    return successResponse(res, 200, 'Poll status updated successfully', poll);
  } catch (error) {
    next(error);
  }
};

export const deletePoll = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const poll = await pollService.softDeletePoll(req.params.id, deletedRemarks, updated_by);
    if (!poll) {
      return errorResponse(res, 404, 'Poll not found');
    }
    return successResponse(res, 200, 'Poll deleted successfully', null);
  } catch (error) {
    next(error);
  }
};
