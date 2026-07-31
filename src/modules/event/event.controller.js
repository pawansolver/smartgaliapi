import { successResponse, errorResponse } from '../../utils/response.js';
import * as eventService from './event.service.js';
import { getImageUrl } from '../../utils/fileUpload.js';

export const createEvent = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.cover_image = getImageUrl(req, 'event', req.file.filename);
    }
    const event = await eventService.createEvent(data);
    return successResponse(res, 201, 'Event created successfully', event);
  } catch (error) {
    next(error);
  }
};

export const getAllEvents = async (req, res, next) => {
  try {
    const events = await eventService.getAllEvents();
    return successResponse(res, 200, 'Events fetched successfully', events);
  } catch (error) {
    next(error);
  }
};

export const getEventById = async (req, res, next) => {
  try {
    const event = await eventService.getEventById(req.params.id);
    if (!event) {
      return errorResponse(res, 404, 'Event not found');
    }
    return successResponse(res, 200, 'Event fetched successfully', event);
  } catch (error) {
    next(error);
  }
};

export const updateEvent = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.cover_image = getImageUrl(req, 'event', req.file.filename);
    }
    const event = await eventService.updateEvent(req.params.id, data);
    if (!event) {
      return errorResponse(res, 404, 'Event not found');
    }
    return successResponse(res, 200, 'Event updated successfully', event);
  } catch (error) {
    next(error);
  }
};

export const deleteEvent = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const event = await eventService.softDeleteEvent(req.params.id, deletedRemarks, updated_by);
    if (!event) {
      return errorResponse(res, 404, 'Event not found');
    }
    return successResponse(res, 200, 'Event deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteEvents = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await eventService.bulkSoftDeleteEvents(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Events deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
