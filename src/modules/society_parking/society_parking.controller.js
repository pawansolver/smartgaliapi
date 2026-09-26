import { successResponse, errorResponse } from '../../utils/response.js';
import * as societyParkingService from './society_parking.service.js';

const getContextSocietyId = (req) => {
  return req.societyContext?.societyId || req.society?.id || req.query.society_id || req.body.society_id;
};

// ── Areas ──────────────────────────────────────────────────────────────────
export const getAreas = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const areas = await societyParkingService.listParkingAreas(societyId, req.query);
    return successResponse(res, 200, 'Parking areas retrieved successfully', areas);
  } catch (error) {
    return next(error);
  }
};

export const createArea = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const area = await societyParkingService.createParkingArea(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Parking area created successfully', area);
  } catch (error) {
    return next(error);
  }
};

export const updateArea = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const area = await societyParkingService.updateParkingArea(societyId, req.params.id, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Parking area updated successfully', area);
  } catch (error) {
    return next(error);
  }
};

// ── Slots ──────────────────────────────────────────────────────────────────
export const getSlots = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const slots = await societyParkingService.listParkingSlots(societyId, req.query);
    return successResponse(res, 200, 'Parking slots retrieved successfully', slots);
  } catch (error) {
    return next(error);
  }
};

export const createSlot = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const slot = await societyParkingService.createParkingSlot(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Parking slot created successfully', slot);
  } catch (error) {
    return next(error);
  }
};

export const updateSlot = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const slot = await societyParkingService.updateParkingSlot(societyId, req.params.id, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Parking slot updated successfully', slot);
  } catch (error) {
    return next(error);
  }
};

export const blockSlot = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const slot = await societyParkingService.blockParkingSlot(societyId, req.params.id, userId, req.body.reason, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Parking slot blocked successfully', slot);
  } catch (error) {
    return next(error);
  }
};

export const unblockSlot = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const slot = await societyParkingService.unblockParkingSlot(societyId, req.params.id, userId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Parking slot unblocked successfully', slot);
  } catch (error) {
    return next(error);
  }
};

export const setMaintenance = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const slot = await societyParkingService.setSlotMaintenance(societyId, req.params.id, userId, req.body.reason, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Slot maintenance status updated successfully', slot);
  } catch (error) {
    return next(error);
  }
};

// ── Vehicles ───────────────────────────────────────────────────────────────
export const getVehicles = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const vehicles = await societyParkingService.listSocietyVehicles(societyId, req.query);
    return successResponse(res, 200, 'Society vehicles retrieved successfully', vehicles);
  } catch (error) {
    return next(error);
  }
};

export const getMyVehicles = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const vehicles = await societyParkingService.listMyVehicles(societyId, userId);
    return successResponse(res, 200, 'My vehicles retrieved successfully', vehicles);
  } catch (error) {
    return next(error);
  }
};

export const registerVehicle = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const vehicle = await societyParkingService.registerVehicle(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Vehicle registered successfully', vehicle);
  } catch (error) {
    return next(error);
  }
};

export const updateVehicle = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const vehicle = await societyParkingService.updateVehicle(societyId, req.params.id, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Vehicle updated successfully', vehicle);
  } catch (error) {
    return next(error);
  }
};

export const deactivateVehicle = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const result = await societyParkingService.deactivateVehicle(societyId, req.params.id, userId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, result.message);
  } catch (error) {
    return next(error);
  }
};

// ── Allocations ────────────────────────────────────────────────────────────
export const getAllocations = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const allocations = await societyParkingService.listAllocations(societyId, req.query);
    return successResponse(res, 200, 'Parking allocations retrieved successfully', allocations);
  } catch (error) {
    return next(error);
  }
};

export const getMyAllocations = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const allocations = await societyParkingService.listMyAllocations(societyId, userId);
    return successResponse(res, 200, 'My parking allocations retrieved successfully', allocations);
  } catch (error) {
    return next(error);
  }
};

export const allocateSlot = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const allocation = await societyParkingService.allocateSlot(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Parking slot allocated successfully', allocation);
  } catch (error) {
    return next(error);
  }
};

export const reassignSlot = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const allocation = await societyParkingService.reassignSlot(societyId, req.params.id, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Parking slot reassigned successfully', allocation);
  } catch (error) {
    return next(error);
  }
};

export const releaseSlot = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const result = await societyParkingService.releaseSlot(societyId, req.params.id, userId, req.body.reason, req.body.notes, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, result.message);
  } catch (error) {
    return next(error);
  }
};

// ── Visitor Reservations ───────────────────────────────────────────────────
export const getVisitorReservations = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const reservations = await societyParkingService.listVisitorReservations(societyId, req.query);
    return successResponse(res, 200, 'Visitor parking records retrieved successfully', reservations);
  } catch (error) {
    return next(error);
  }
};

export const preBookVisitor = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const reservation = await societyParkingService.preBookVisitorParking(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Visitor parking pre-booked successfully', reservation);
  } catch (error) {
    return next(error);
  }
};

export const guardCheckIn = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const guardUserId = req.user?.id || req.user?.userId;
    const reservation = await societyParkingService.guardCheckInVisitor(societyId, guardUserId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, 'Visitor vehicle checked in successfully', reservation);
  } catch (error) {
    return next(error);
  }
};

export const guardCheckOut = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const guardUserId = req.user?.id || req.user?.userId;
    const result = await societyParkingService.guardCheckOutVisitor(societyId, guardUserId, req.params.id, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 200, result.message, { durationMinutes: result.durationMinutes });
  } catch (error) {
    return next(error);
  }
};

// ── Violations ─────────────────────────────────────────────────────────────
export const reportViolation = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const violation = await societyParkingService.reportParkingViolation(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Parking violation reported successfully. Guard & Admin notified.', violation);
  } catch (error) {
    return next(error);
  }
};

export const getViolations = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const query = { ...req.query };
    // If resident without manage perms, filter to own reports only
    if (req.societyMembership?.role === 'member' || req.societyMembership?.role === 'resident') {
      query.reporter_user_id = req.user?.id || req.user?.userId;
    }
    const violations = await societyParkingService.listViolations(societyId, query);
    return successResponse(res, 200, 'Parking violations retrieved successfully', violations);
  } catch (error) {
    return next(error);
  }
};

export const updateViolationStatus = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const violation = await societyParkingService.updateViolationStatus(societyId, req.params.id, userId, req.body);
    return successResponse(res, 200, 'Violation status updated successfully', violation);
  } catch (error) {
    return next(error);
  }
};

// ── History & Summary ──────────────────────────────────────────────────────
export const getHistory = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const history = await societyParkingService.getParkingHistory(societyId, req.query);
    return successResponse(res, 200, 'Parking audit trail retrieved successfully', history);
  } catch (error) {
    return next(error);
  }
};

export const getMyHistory = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const userId = req.user?.id || req.user?.userId;
    const history = await societyParkingService.getMyParkingHistory(societyId, userId);
    return successResponse(res, 200, 'My parking history retrieved successfully', history);
  } catch (error) {
    return next(error);
  }
};

export const getSummary = async (req, res, next) => {
  try {
    const societyId = getContextSocietyId(req);
    const summary = await societyParkingService.getParkingSummary(societyId);
    return successResponse(res, 200, 'Parking summary metrics retrieved successfully', summary);
  } catch (error) {
    return next(error);
  }
};

// ── Backward Compatible Legacy Endpoints ────────────────────────────────────
export const createParking = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const societyId = req.body.society_id;
    const parking = await societyParkingService.createParking(societyId, userId, req.body, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, 201, 'Society parking allocated successfully', parking);
  } catch (error) {
    return next(error);
  }
};

export const getAllParkings = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId || req.query.society_id;
    const result = await societyParkingService.getAllParkings(societyId, req.query);
    return successResponse(res, 200, 'Society parking records retrieved successfully', result.data, {
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

export const getParkingById = async (req, res, next) => {
  try {
    const societyId = req.societyContext?.societyId;
    const parking = await societyParkingService.getParkingById(req.params.id, societyId);
    if (!parking) return errorResponse(res, 404, 'Society parking record not found');
    return successResponse(res, 200, 'Society parking retrieved successfully', parking);
  } catch (error) {
    return next(error);
  }
};

export const updateParking = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const parking = await societyParkingService.updateParking(req.params.id, societyId, req.body, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!parking) return errorResponse(res, 404, 'Society parking record not found');
    return successResponse(res, 200, 'Society parking updated successfully', parking);
  } catch (error) {
    return next(error);
  }
};

export const deleteParking = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || req.user?.userId;
    const societyId = req.societyContext?.societyId;
    const parking = await societyParkingService.softDeleteParking(req.params.id, societyId, req.body?.deletedRemarks, actorUserId, {
      requestId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!parking) return errorResponse(res, 404, 'Society parking record not found');
    return successResponse(res, 200, 'Society parking deleted successfully');
  } catch (error) {
    return next(error);
  }
};
