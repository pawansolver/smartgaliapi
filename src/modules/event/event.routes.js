/**
 * Event Routes Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * REST endpoints for Event Discovery, Creation, Management, and Concurrency-Safe RSVP.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import express from 'express';
import * as eventController from './event.controller.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  createEventSchema,
  updateEventSchema,
  rsvpSchema,
  nearbyQuerySchema,
  upcomingQuerySchema,
  eventIdParamSchema,
} from './event.validation.js';
import { uploadImage } from '../../utils/fileUpload.js';
import {
  eventReadLimiter,
  eventCreateLimiter,
  eventRsvpLimiter,
  eventNearbyLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

// ── Public / Read Endpoints ──────────────────────────────────────────────────
router.get('/categories', eventReadLimiter, eventController.getEventCategories);
router.get('/upcoming', eventReadLimiter, optionalAuthenticate, validateQuery(upcomingQuerySchema), eventController.getUpcomingEvents);
router.get('/nearby', eventNearbyLimiter, optionalAuthenticate, validateQuery(nearbyQuerySchema), eventController.getNearbyEvents);
router.get('/my-rsvps', authenticate, eventReadLimiter, eventController.getMyRsvps);
router.get('/my', authenticate, eventReadLimiter, eventController.getMyRsvps); // PRD Sec 18.6

// ── CRUD Endpoints ───────────────────────────────────────────────────────────
router.get('/', eventReadLimiter, optionalAuthenticate, validateQuery(upcomingQuerySchema), eventController.getUpcomingEvents);

router.post(
  '/',
  authenticate,
  eventCreateLimiter,
  uploadImage('event').single('cover_image'),
  validateBody(createEventSchema),
  eventController.createEvent
);

router.get(
  '/:id',
  eventReadLimiter,
  optionalAuthenticate,
  validateParams(eventIdParamSchema),
  eventController.getEventById
);

router.put(
  '/:id',
  authenticate,
  eventCreateLimiter,
  validateParams(eventIdParamSchema),
  uploadImage('event').single('cover_image'),
  validateBody(updateEventSchema),
  eventController.updateEvent
);

router.put(
  '/:id/cancel',
  authenticate,
  validateParams(eventIdParamSchema),
  eventController.cancelEvent
);

router.delete(
  '/:id',
  authenticate,
  validateParams(eventIdParamSchema),
  eventController.deleteEvent
);

// ── RSVP Endpoints ───────────────────────────────────────────────────────────
router.put(
  '/:id/rsvp',
  authenticate,
  eventRsvpLimiter,
  validateParams(eventIdParamSchema),
  validateBody(rsvpSchema),
  eventController.setEventRsvp
);

router.delete(
  '/:id/rsvp',
  authenticate,
  eventRsvpLimiter,
  validateParams(eventIdParamSchema),
  eventController.cancelEventRsvp
);

router.get(
  '/:id/participants',
  eventReadLimiter,
  optionalAuthenticate,
  validateParams(eventIdParamSchema),
  eventController.getEventParticipants
);

// PRD Section 18.6: POST /events/:id/join and POST /events/:id/leave
router.post(
  '/:id/join',
  authenticate,
  eventRsvpLimiter,
  validateParams(eventIdParamSchema),
  eventController.joinEvent
);

router.post(
  '/:id/leave',
  authenticate,
  eventRsvpLimiter,
  validateParams(eventIdParamSchema),
  eventController.leaveEvent
);

export default router;
