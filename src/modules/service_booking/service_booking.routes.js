import express from 'express';
import * as serviceBookingController from './service_booking.controller.js';
import { authenticate, requireGlobalAdmin } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import {
  createBookingSchema,
  cancelBookingSchema,
  rejectBookingSchema,
  scheduleBookingSchema,
  startBookingSchema,
  transitionBookingSchema,
} from './service_booking.validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ServiceBookings
 *   description: Enterprise Service Booking and Lifecycle State Machine APIs
 */

// ── Resident Endpoints ────────────────────────────────────────────────────────

router.get('/available-slots/:listingId', serviceBookingController.getAvailableSlotsForListing);
router.post('/', authenticate, validateBody(createBookingSchema), serviceBookingController.createBooking);
router.get('/my', authenticate, serviceBookingController.getMyResidentBookings);

// ── Provider Endpoints ────────────────────────────────────────────────────────

router.get('/provider/requests', authenticate, serviceBookingController.getProviderRequests);
router.get('/provider/bookings', authenticate, serviceBookingController.getProviderBookings);

// ── Admin Monitoring ─────────────────────────────────────────────────────────

router.get('/admin/all', authenticate, requireGlobalAdmin, serviceBookingController.getAdminAllBookings);

// ── Booking Detail & Timeline ────────────────────────────────────────────────

router.get('/:id', authenticate, serviceBookingController.getBookingById);
router.get('/:id/timeline', authenticate, serviceBookingController.getBookingTimeline);

// ── Lifecycle State Machine Transitions ──────────────────────────────────────

router.post('/:id/accept', authenticate, serviceBookingController.acceptBooking);
router.post('/:id/reject', authenticate, validateBody(rejectBookingSchema), serviceBookingController.rejectBooking);
router.post('/:id/schedule', authenticate, validateBody(scheduleBookingSchema), serviceBookingController.scheduleBooking);
router.post('/:id/reschedule', authenticate, validateBody(scheduleBookingSchema), serviceBookingController.rescheduleBooking);
router.post('/:id/on-the-way', authenticate, serviceBookingController.onTheWayBooking);
router.post('/:id/start', authenticate, validateBody(startBookingSchema), serviceBookingController.startBooking);
router.post('/:id/complete', authenticate, serviceBookingController.completeBooking);
router.post('/:id/cancel', authenticate, validateBody(cancelBookingSchema), serviceBookingController.cancelBooking);
router.put('/:id/transition', authenticate, validateBody(transitionBookingSchema), serviceBookingController.transitionBooking);

router.delete('/:id', authenticate, requireGlobalAdmin, serviceBookingController.deleteBooking);

export default router;
