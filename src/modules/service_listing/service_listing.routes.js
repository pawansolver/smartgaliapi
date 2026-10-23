import express from 'express';
import { uploadImage } from '../../utils/fileUpload.js';
import * as serviceListingController from './service_listing.controller.js';
import { authenticate, optionalAuthenticate, requireGlobalAdmin } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validation.middleware.js';
import { errorResponse } from '../../utils/response.js';
import env from '../../config/env.js';
import {
  createListingSchema,
  updateListingSchema,
  moderateListingSchema,
  queryListingsSchema,
} from './service_listing.validation.js';

const router = express.Router();

/**
 * Middleware: Authenticates token or seamlessly falls back to dev provider user in development.
 * Requested by user to allow resident accounts / local dev testing without token or KYC blocks.
 */
export const authenticateOrDevBypass = async (req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development' || !env.isProduction || process.env.BYPASS_SERVICE_AUTH === 'true';
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticate(req, res, (err) => {
      if (err) {
        if (isDev) {
          req.user = { id: 391, userId: 391, userRole: 'provider' };
          return next();
        }
        return next(err);
      }
      if (isDev && req.user) {
        // If testing account is resident, allow provider operations during dev bypass
        if (req.user.userRole === 'resident' || !req.user.userRole) {
          req.user.userRole = 'provider';
        }
      }
      return next();
    });
  }

  if (isDev) {
    req.user = { id: 391, userId: 391, userRole: 'provider' };
    return next();
  }

  return errorResponse(res, 401, 'Access denied. No token provided.');
};

/**
 * @swagger
 * tags:
 *   name: ServiceListings
 *   description: Enterprise Service Listing and Marketplace APIs
 */

// ── Provider Own Listings ────────────────────────────────────────────────────

router.get('/my/listings', authenticateOrDevBypass, serviceListingController.getMyListings);

// ── Admin Moderation ─────────────────────────────────────────────────────────

router.get('/admin/all', authenticate, requireGlobalAdmin, serviceListingController.getAdminAllListings);
router.patch('/:id/toggle-status', authenticate, requireGlobalAdmin, serviceListingController.toggleListingStatus);
router.patch('/:id/moderate', authenticate, requireGlobalAdmin, validateBody(moderateListingSchema), serviceListingController.moderateListing);
router.post('/bulk-delete', authenticate, requireGlobalAdmin, serviceListingController.bulkDeleteListings);

// ── Public / Discovery Routes (Guest & Resident) ─────────────────────────────

router.get('/', optionalAuthenticate, validateQuery(queryListingsSchema), serviceListingController.getAllListings);
router.get('/:id', optionalAuthenticate, serviceListingController.getListingById);
router.post('/:id/calculate-price', optionalAuthenticate, serviceListingController.calculatePrice);

// ── Step 5: Enterprise Media & KYC Routes ────────────────────────────────────

router.get('/:id/media', optionalAuthenticate, serviceListingController.getListingMedia);
router.post(
  '/:id/media',
  authenticateOrDevBypass,
  uploadImage('services').fields([
    { name: 'photo', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  serviceListingController.uploadListingMedia
);
router.delete('/:id/media/:mediaId', authenticateOrDevBypass, serviceListingController.deleteListingMedia);
router.get('/:id/kyc-status', authenticateOrDevBypass, serviceListingController.getListingKycStatus);
router.post('/:id/submit', authenticateOrDevBypass, serviceListingController.submitListingForReview);


// ── Provider Listing CRUD ────────────────────────────────────────────────────

router.post('/', authenticateOrDevBypass, validateBody(createListingSchema), serviceListingController.createListing);
router.put('/:id', authenticateOrDevBypass, validateBody(updateListingSchema), serviceListingController.updateListing);
router.patch('/:id/pause', authenticateOrDevBypass, serviceListingController.pauseListing);
router.patch('/:id/resume', authenticateOrDevBypass, serviceListingController.resumeListing);
router.delete('/:id', authenticateOrDevBypass, serviceListingController.deleteListing);

export default router;
