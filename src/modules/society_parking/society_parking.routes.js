import express from 'express';
import * as societyParkingController from './society_parking.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  createParkingAreaSchema,
  updateParkingAreaSchema,
  createParkingSlotSchema,
  updateParkingSlotSchema,
  blockSlotSchema,
  setMaintenanceSchema,
  registerVehicleSchema,
  updateVehicleSchema,
  allocateSlotSchema,
  reassignSlotSchema,
  releaseSlotSchema,
  preBookVisitorSchema,
  guardCheckInSchema,
  guardCheckOutSchema,
  reportViolationSchema,
  updateViolationStatusSchema,
} from './society_parking.validation.js';
import {
  idParamSchema,
  createParkingSchema,
  updateParkingSchema,
  listParkingQuerySchema,
} from '../society_profile/society.validation.js';
import {
  requireSocietyMember,
  requireSocietyRole,
  requireSocietyPermission,
} from '../../middleware/societyAuth.middleware.js';
import {
  societyReadLimiter,
  societyMutationLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

// ── 1. Areas ────────────────────────────────────────────────────────────────
router.get(
  '/areas',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyParkingController.getAreas
);

router.post(
  '/areas',
  authenticate,
  societyMutationLimiter,
  requireSocietyPermission('parking.area.create'),
  validateBody(createParkingAreaSchema),
  societyParkingController.createArea
);

router.put(
  '/areas/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('parking.area.update'),
  validateBody(updateParkingAreaSchema),
  societyParkingController.updateArea
);

// ── 2. Slots ────────────────────────────────────────────────────────────────
router.get(
  '/slots',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyParkingController.getSlots
);

router.post(
  '/slots',
  authenticate,
  societyMutationLimiter,
  requireSocietyPermission('parking.slot.create'),
  validateBody(createParkingSlotSchema),
  societyParkingController.createSlot
);

router.put(
  '/slots/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('parking.slot.update'),
  validateBody(updateParkingSlotSchema),
  societyParkingController.updateSlot
);

router.post(
  '/slots/:id/block',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('parking.block'),
  validateBody(blockSlotSchema),
  societyParkingController.blockSlot
);

router.post(
  '/slots/:id/unblock',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('parking.block'),
  societyParkingController.unblockSlot
);

router.post(
  '/slots/:id/maintenance',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('parking.maintenance'),
  validateBody(setMaintenanceSchema),
  societyParkingController.setMaintenance
);

// ── 3. Vehicles ─────────────────────────────────────────────────────────────
router.get(
  '/vehicles',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyParkingController.getVehicles
);

router.get(
  '/vehicles/my',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyParkingController.getMyVehicles
);

router.post(
  '/vehicles',
  authenticate,
  societyMutationLimiter,
  requireSocietyMember,
  validateBody(registerVehicleSchema),
  societyParkingController.registerVehicle
);

router.put(
  '/vehicles/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  validateBody(updateVehicleSchema),
  societyParkingController.updateVehicle
);

router.delete(
  '/vehicles/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyParkingController.deactivateVehicle
);

// ── 4. Allocations ──────────────────────────────────────────────────────────
router.get(
  '/allocations',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyParkingController.getAllocations
);

router.get(
  '/allocations/my',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyParkingController.getMyAllocations
);

router.post(
  '/allocations',
  authenticate,
  societyMutationLimiter,
  requireSocietyPermission('parking.allocate'),
  validateBody(allocateSlotSchema),
  societyParkingController.allocateSlot
);

router.post(
  '/allocations/:id/reassign',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('parking.reassign'),
  validateBody(reassignSlotSchema),
  societyParkingController.reassignSlot
);

router.post(
  '/allocations/:id/release',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('parking.release'),
  validateBody(releaseSlotSchema),
  societyParkingController.releaseSlot
);

// ── 5. Visitor Parking Reservations & Gate Desk ─────────────────────────────
router.get(
  '/visitor-reservations',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyParkingController.getVisitorReservations
);

// Resident pre-books guest parking (Resident permission)
router.post(
  '/visitor-reservations',
  authenticate,
  societyMutationLimiter,
  requireSocietyMember,
  validateBody(preBookVisitorSchema),
  societyParkingController.preBookVisitor
);

// Guard Physical Check-In (Guard / Gate Desk operation)
router.post(
  '/visitor-reservations/check-in',
  authenticate,
  societyMutationLimiter,
  requireSocietyPermission('parking.visitor.checkin'),
  validateBody(guardCheckInSchema),
  societyParkingController.guardCheckIn
);

router.post(
  '/visitor-reservations/:id/check-in',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('parking.visitor.checkin'),
  validateBody(guardCheckInSchema),
  societyParkingController.guardCheckIn
);

// Guard Physical Check-Out (Guard / Gate Desk operation)
router.post(
  '/visitor-reservations/:id/check-out',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('parking.visitor.checkout'),
  validateBody(guardCheckOutSchema),
  societyParkingController.guardCheckOut
);

// ── 6. Violations ───────────────────────────────────────────────────────────
router.post(
  '/violations',
  authenticate,
  societyMutationLimiter,
  requireSocietyMember,
  validateBody(reportViolationSchema),
  societyParkingController.reportViolation
);

router.get(
  '/violations',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyParkingController.getViolations
);

router.put(
  '/violations/:id/status',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('parking.violation.manage'),
  validateBody(updateViolationStatusSchema),
  societyParkingController.updateViolationStatus
);

// ── 7. History & Summary ───────────────────────────────────────────────────
router.get(
  '/history',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyParkingController.getHistory
);

router.get(
  '/history/my',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyParkingController.getMyHistory
);

router.get(
  '/summary',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyParkingController.getSummary
);

// ── 8. Legacy Backward-Compatible Endpoints ─────────────────────────────────
router.post(
  '/',
  authenticate,
  societyMutationLimiter,
  requireSocietyRole(['admin', 'committee']),
  validateBody(createParkingSchema),
  societyParkingController.createParking
);

router.get(
  '/',
  authenticate,
  societyReadLimiter,
  validateQuery(listParkingQuerySchema),
  requireSocietyMember,
  societyParkingController.getAllParkings
);

router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyParkingController.getParkingById
);

router.put(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  validateBody(updateParkingSchema),
  societyParkingController.updateParking
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  societyParkingController.deleteParking
);

export default router;
