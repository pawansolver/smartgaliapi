/**
 * Event Controller Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides HTTP request handling, Multer image normalization, and standard
 * success/error responses for all Event operations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { successResponse, errorResponse } from '../../utils/response.js';
import * as eventService from './event.service.js';
import * as participantService from '../event_participant/event_participant.service.js';
import { getImageUrl } from '../../utils/fileUpload.js';
import { normalizeMediaUrl } from '../../utils/mediaUrl.js';

export const createEvent = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.cover_image = getImageUrl(req, 'event', req.file.filename);
    }
    const creatorId = req.user?.id || req.user?.userId;
    const event = await eventService.createEvent(data, creatorId, req.user);
    return successResponse(res, 201, 'Event created successfully', event);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

export const getUpcomingEvents = async (req, res, next) => {
  try {
    const { category_id, event_type, community_id, search, cursor, limit } = req.query;
    const result = await eventService.getUpcomingEvents({
      categoryId: category_id,
      eventType: event_type,
      communityId: community_id,
      search,
      cursor,
      limit,
      user: req.user,
    });
    return successResponse(res, 200, 'Upcoming events fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getNearbyEvents = async (req, res, next) => {
  try {
    const { lat, lng, radiusKm, category_id, event_type, cursor, limit } = req.query;
    const result = await eventService.getNearbyEvents({
      lat,
      lng,
      radiusKm,
      categoryId: category_id,
      eventType: event_type,
      cursor,
      limit,
      user: req.user,
    });
    return successResponse(res, 200, 'Nearby events fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getEventById = async (req, res, next) => {
  try {
    const event = await eventService.getEventById(req.params.id, req.user);
    if (!event) {
      return errorResponse(res, 404, 'Event not found');
    }
    return successResponse(res, 200, 'Event fetched successfully', event);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

export const updateEvent = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.cover_image = getImageUrl(req, 'event', req.file.filename);
    }
    const event = await eventService.updateEvent(req.params.id, data, req.user);
    if (!event) {
      return errorResponse(res, 404, 'Event not found');
    }
    return successResponse(res, 200, 'Event updated successfully', event);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

export const cancelEvent = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const event = await eventService.cancelEvent(req.params.id, reason, req.user);
    if (!event) {
      return errorResponse(res, 404, 'Event not found');
    }
    return successResponse(res, 200, 'Event cancelled successfully', event);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

export const deleteEvent = async (req, res, next) => {
  try {
    const { deletedRemarks } = req.body;
    const event = await eventService.softDeleteEvent(req.params.id, deletedRemarks, req.user);
    if (!event) {
      return errorResponse(res, 404, 'Event not found');
    }
    return successResponse(res, 200, 'Event deleted successfully (soft delete)', null);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

export const getEventCategories = async (req, res, next) => {
  try {
    const categories = await eventService.getEventCategories();
    return successResponse(res, 200, 'Event categories fetched successfully', categories);
  } catch (error) {
    next(error);
  }
};

export const setEventRsvp = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id || req.user.userId;
    const { status } = req.body;
    const result = await participantService.setEventRsvp(eventId, userId, status);
    return successResponse(res, 200, 'RSVP updated successfully', result);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

export const cancelEventRsvp = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id || req.user.userId;
    const result = await participantService.cancelEventRsvp(eventId, userId);
    return successResponse(res, 200, 'RSVP cancelled successfully', result);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

export const getEventParticipants = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const { status, cursor, limit } = req.query;
    const result = await participantService.getEventParticipants(eventId, { status, cursor, limit });
    return successResponse(res, 200, 'Event participants fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getMyRsvps = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { status, cursor, limit } = req.query;
    const result = await participantService.getUserRsvps(userId, { status, cursor, limit });
    return successResponse(res, 200, 'My RSVPs fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

// Aliases
export const getAllEvents = getUpcomingEvents;
export const bulkDeleteEvents = async (req, res, next) => {
  try {
    const { ids, deletedRemarks } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await eventService.bulkSoftDeleteEvents(ids, deletedRemarks, req.user?.id);
    return successResponse(res, 200, 'Events deleted successfully', result);
  } catch (error) {
    next(error);
  }
};
export const joinEvent = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const userId = req.user?.id || req.user?.userId;
    const status = req.body?.status || 'going';
    const participant = await participantService.setEventRsvp(eventId, userId, status);
    return successResponse(res, 200, 'Successfully joined the event', participant);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

export const leaveEvent = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const userId = req.user?.id || req.user?.userId;
    const result = await participantService.cancelEventRsvp(eventId, userId);
    return successResponse(res, 200, 'Successfully left the event', result);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};
