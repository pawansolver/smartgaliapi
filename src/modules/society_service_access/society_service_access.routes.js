import { Router } from 'express';
import societyServiceAccessController from './society_service_access.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validation.middleware.js';
import {
  requestAccessSchema,
  reviewActionSchema,
  rejectActionSchema,
  queryAccessSchema,
} from './society_service_access.validation.js';

const router = Router();

// Provider endpoints
router.post(
  '/',
  authenticate,
  validateBody(requestAccessSchema),
  societyServiceAccessController.requestAccess
);

router.get(
  '/provider',
  authenticate,
  validateQuery(queryAccessSchema),
  societyServiceAccessController.getProviderRequests
);

// Society Admin endpoints (strictly guarded by society role)
router.get(
  '/society',
  authenticate,
  requireSocietyRole(['admin', 'committee']),
  validateQuery(queryAccessSchema),
  societyServiceAccessController.getSocietyRequests
);

router.get(
  '/:id',
  authenticate,
  societyServiceAccessController.getAccessById
);

router.post(
  '/:id/approve',
  authenticate,
  requireSocietyRole(['admin']),
  societyServiceAccessController.approveAccess
);

router.post(
  '/:id/reject',
  authenticate,
  requireSocietyRole(['admin']),
  validateBody(rejectActionSchema),
  societyServiceAccessController.rejectAccess
);

router.post(
  '/:id/suspend',
  authenticate,
  requireSocietyRole(['admin']),
  validateBody(reviewActionSchema),
  societyServiceAccessController.suspendAccess
);

router.post(
  '/:id/revoke',
  authenticate,
  requireSocietyRole(['admin']),
  validateBody(reviewActionSchema),
  societyServiceAccessController.revokeAccess
);

export default router;
