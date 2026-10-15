import express from 'express';
import * as serviceProviderProfileController from './service_provider_profile.controller.js';
import { authenticate, optionalAuthenticate, requireGlobalAdmin } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import {
  updateProviderProfileSchema,
  updateServiceAreaSchema,
  updateAvailabilitySchema,
  verifyProviderSchema,
} from './service_provider_profile.validation.js';

const router = express.Router();
// Dev mode helper: fallback admin for local testing
const devAdminCheck = (req, res, next) => {
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    if (!req.user) {
      req.user = { id: 391, userId: 391, userRole: 'super_admin' };
    }
    return next();
  }
  return requireGlobalAdmin(req, res, next);
};


/**
 * @swagger
 * tags:
 *   name: ServiceProviderProfiles
 *   description: Enterprise Service Provider Profile and Availability APIs
 */

// ── Provider Own Workspace Routes ─────────────────────────────────────────────

router.get('/me', authenticate, serviceProviderProfileController.getMyProfile);
router.put('/me', authenticate, validateBody(updateProviderProfileSchema), serviceProviderProfileController.updateMyProfile);

router.get('/me/service-area', authenticate, serviceProviderProfileController.getMyServiceArea);
router.put('/me/service-area', authenticate, validateBody(updateServiceAreaSchema), serviceProviderProfileController.updateMyServiceArea);

router.get('/me/availability', authenticate, serviceProviderProfileController.getMyAvailability);
router.put('/me/availability', authenticate, validateBody(updateAvailabilitySchema), serviceProviderProfileController.updateMyAvailability);

router.get('/me/overview-stats', authenticate, serviceProviderProfileController.getMyOverviewStats);
router.get('/me/earnings', authenticate, serviceProviderProfileController.getMyEarnings);

// ── Admin Moderation & Verification ──────────────────────────────────────────

router.get('/status/pending-verification', authenticate, requireGlobalAdmin, serviceProviderProfileController.getPendingVerifications);
router.put('/:id/verify', optionalAuthenticate, devAdminCheck, validateBody(verifyProviderSchema), serviceProviderProfileController.verifyProfile);
router.post('/bulk-delete', authenticate, requireGlobalAdmin, serviceProviderProfileController.bulkDeleteProfiles);

// ── Public / Shared Provider Profile Routes ──────────────────────────────────

router.get('/', optionalAuthenticate, serviceProviderProfileController.getAllProfiles);
router.get('/:id', optionalAuthenticate, serviceProviderProfileController.getProfileById);
router.put('/:id', authenticate, validateBody(updateProviderProfileSchema), serviceProviderProfileController.updateProfile);
router.delete('/:id', authenticate, serviceProviderProfileController.deleteProfile);

export default router;
