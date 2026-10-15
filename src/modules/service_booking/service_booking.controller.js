import { successResponse, errorResponse } from '../../utils/response.js';
import * as serviceBookingService from './service_booking.service.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';

export const createBooking = async (req, res, next) => {
  try {
    const booking = await serviceBookingService.createBooking(req.body, req.user);
    return successResponse(res, 201, 'Service booking created successfully', booking);
  } catch (error) {
    if (error.statusCode) {
      return errorResponse(res, error.statusCode, error.message);
    }
    next(error);
  }
};

export const getMyResidentBookings = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const bookings = await serviceBookingService.getMyResidentBookings(userId, req.query.status);
    return successResponse(res, 200, 'Resident bookings fetched successfully', bookings);
  } catch (error) {
    next(error);
  }
};

export const getProviderRequests = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const requests = await serviceBookingService.getProviderBookings(userId, { isRequestsOnly: true });
    return successResponse(res, 200, 'Provider booking requests fetched successfully', requests);
  } catch (error) {
    next(error);
  }
};

export const getProviderBookings = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const bookings = await serviceBookingService.getProviderBookings(userId, { statusFilter: req.query.status });
    return successResponse(res, 200, 'Provider bookings fetched successfully', bookings);
  } catch (error) {
    next(error);
  }
};

export const getAdminAllBookings = async (req, res, next) => {
  try {
    const result = await serviceBookingService.getAdminAllBookings(req.query);
    return successResponse(res, 200, 'Admin bookings fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getBookingById = async (req, res, next) => {
  try {
    const booking = await serviceBookingService.getBookingById(req.params.id);
    if (!booking) {
      return errorResponse(res, 404, 'Service booking not found');
    }

    const userId = req.user?.id || req.user?.userId;
    const isAdmin = isGlobalAdminUser(req.user);
    const isResident = booking.user_id === userId;
    const isProvider = booking.provider?.user_id === userId || booking.listing?.provider?.user_id === userId;

    if (!isAdmin && !isResident && !isProvider) {
      return errorResponse(res, 403, 'Forbidden: You do not have permission to view this booking');
    }

    // Convert to JSON and apply Doorstep PIN privacy rule:
    // Only resident or admin can view the plaintext PIN before it is verified!
    const bookingJson = booking.toJSON ? booking.toJSON() : { ...booking };
    if (isProvider && !isAdmin && !bookingJson.doorstep_pin_verified) {
      bookingJson.doorstep_pin = null; // Do NOT leak doorstep PIN to provider before arrival verification!
    }

    return successResponse(res, 200, 'Service booking fetched successfully', bookingJson);
  } catch (error) {
    next(error);
  }
};

export const getBookingTimeline = async (req, res, next) => {
  try {
    const booking = await serviceBookingService.getBookingById(req.params.id);
    if (!booking) return errorResponse(res, 404, 'Booking not found');

    const userId = req.user?.id || req.user?.userId;
    const isAdmin = isGlobalAdminUser(req.user);
    const isResident = booking.user_id === userId;
    const isProvider = booking.provider?.user_id === userId || booking.listing?.provider?.user_id === userId;

    if (!isAdmin && !isResident && !isProvider) {
      return errorResponse(res, 403, 'Forbidden');
    }

    const timelines = await serviceBookingService.getBookingTimelines(req.params.id);
    return successResponse(res, 200, 'Booking timeline fetched successfully', timelines);
  } catch (error) {
    next(error);
  }
};

// Transition Endpoints
export const acceptBooking = async (req, res, next) => {
  try {
    const updated = await serviceBookingService.transitionBooking(req.params.id, 'accept', req.body, req.user);
    return successResponse(res, 200, 'Booking accepted successfully', updated);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};

export const rejectBooking = async (req, res, next) => {
  try {
    const updated = await serviceBookingService.transitionBooking(req.params.id, 'reject', req.body, req.user);
    return successResponse(res, 200, 'Booking rejected successfully', updated);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};

export const scheduleBooking = async (req, res, next) => {
  try {
    const updated = await serviceBookingService.transitionBooking(req.params.id, 'schedule', req.body, req.user);
    return successResponse(res, 200, 'Booking scheduled successfully', updated);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};

export const onTheWayBooking = async (req, res, next) => {
  try {
    const updated = await serviceBookingService.transitionBooking(req.params.id, 'on_the_way', req.body, req.user);
    return successResponse(res, 200, 'Booking status updated to On The Way', updated);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};

export const startBooking = async (req, res, next) => {
  try {
    const updated = await serviceBookingService.transitionBooking(req.params.id, 'start', req.body, req.user);
    return successResponse(res, 200, 'Doorstep PIN verified. Service started.', updated);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};

export const completeBooking = async (req, res, next) => {
  try {
    const updated = await serviceBookingService.transitionBooking(req.params.id, 'complete', req.body, req.user);
    return successResponse(res, 200, 'Service completed successfully', updated);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};

export const cancelBooking = async (req, res, next) => {
  try {
    const updated = await serviceBookingService.transitionBooking(req.params.id, 'cancel', req.body, req.user);
    return successResponse(res, 200, 'Booking cancelled successfully', updated);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};

export const transitionBooking = async (req, res, next) => {
  try {
    const { action, ...params } = req.body;
    const updated = await serviceBookingService.transitionBooking(req.params.id, action, params, req.user);
    return successResponse(res, 200, `Booking transitioned to ${updated.status} successfully`, updated);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};

export const deleteBooking = async (req, res, next) => {
  try {
    const { deletedRemarks } = req.body;
    const updated_by = req.user?.id || req.user?.userId;
    const booking = await serviceBookingService.softDeleteBooking(req.params.id, deletedRemarks, updated_by);
    if (!booking) {
      return errorResponse(res, 404, 'Service booking not found');
    }
    return successResponse(res, 200, 'Service booking deleted successfully', null);
  } catch (error) {
    next(error);
  }
};
