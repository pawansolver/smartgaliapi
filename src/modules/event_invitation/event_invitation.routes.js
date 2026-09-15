import express from 'express';
import * as eventInvitationController from './event_invitation.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../../middleware/validation.middleware.js';
import {
  eventIdParamSchema,
  createInvitationSchema,
  respondInvitationSchema,
} from '../event/event.validation.js';
import { eventCreateLimiter, eventReadLimiter } from '../../middleware/rateLimit.middleware.js';

const router = express.Router({ mergeParams: true });

// 1. My Invitations or Event Invitations depending on mount
router.get(
  '/',
  authenticate,
  eventReadLimiter,
  (req, res, next) => {
    // If mounted as /event/:id/invitations, req.params.id exists -> list invitations for that event
    if (req.params && req.params.id) {
      return eventInvitationController.getEventInvitations(req, res, next);
    }
    // Otherwise mounted as /event-invitation -> list my invitations
    return eventInvitationController.getMyInvitations(req, res, next);
  }
);

router.get(
  '/my',
  authenticate,
  eventReadLimiter,
  eventInvitationController.getMyInvitations
);

// 2. Respond to Invitation (PUT /api/v1/event-invitation/:id/respond)
router.put(
  '/:id/respond',
  authenticate,
  eventCreateLimiter,
  validateBody(respondInvitationSchema),
  eventInvitationController.respondToInvitation
);

// 3. Send Invitations (POST /api/v1/event-invitation or POST /api/v1/event/:id/invitations)
router.post(
  '/',
  authenticate,
  eventCreateLimiter,
  validateBody(createInvitationSchema),
  eventInvitationController.sendInvitations
);

// 4. Get Invitations for a specific event explicitly
router.get(
  '/event/:id',
  authenticate,
  eventReadLimiter,
  validateParams(eventIdParamSchema),
  eventInvitationController.getEventInvitations
);

export default router;
