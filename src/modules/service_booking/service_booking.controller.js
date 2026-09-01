import { successResponse, errorResponse } from '../../utils/response.js';
import * as serviceBookingService from './service_booking.service.js';

export const createBooking = async (req, res, next) => {
  try {
    const booking = await serviceBookingService.createBooking(req.body);
    return successResponse(res, 201, 'Service booking created successfully', booking);
  } catch (error) {
    next(error);
  }
};

export const getAllBookings = async (req, res, next) => {
  try {
    const bookings = await serviceBookingService.getAllBookings();
    return successResponse(res, 200, 'Service bookings fetched successfully', bookings);
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
    return successResponse(res, 200, 'Service booking fetched successfully', booking);
  } catch (error) {
    next(error);
  }
};

export const updateBooking = async (req, res, next) => {
  try {
    const booking = await serviceBookingService.updateBooking(req.params.id, req.body);
    if (!booking) {
      return errorResponse(res, 404, 'Service booking not found');
    }
    return successResponse(res, 200, 'Service booking updated successfully', booking);
  } catch (error) {
    next(error);
  }
};

export const deleteBooking = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const booking = await serviceBookingService.softDeleteBooking(req.params.id, deletedRemarks, updated_by);
    if (!booking) {
      return errorResponse(res, 404, 'Service booking not found');
    }
    return successResponse(res, 200, 'Service booking deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteBookings = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide an array of ids');
    }
    const result = await serviceBookingService.bulkSoftDeleteBookings(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Service bookings deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
