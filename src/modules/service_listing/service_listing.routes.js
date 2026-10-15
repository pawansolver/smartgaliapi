import express from 'express';
import * as serviceListingController from './service_listing.controller.js';
import { authenticate, optionalAuthenticate, requireGlobalAdmin } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validation.middleware.js';
import {
  createListingSchema,
  updateListingSchema,
  moderateListingSchema,
  queryListingsSchema,
} from './service_listing.validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ServiceListings
 *   description: Enterprise Service Listing and Marketplace APIs
 */

// ── Provider Own Listings ────────────────────────────────────────────────────

router.get('/my/listings', authenticate, serviceListingController.getMyListings);

// ── Admin Moderation ─────────────────────────────────────────────────────────

router.get('/admin/all', authenticate, requireGlobalAdmin, serviceListingController.getAdminAllListings);
router.patch('/:id/moderate', authenticate, requireGlobalAdmin, validateBody(moderateListingSchema), serviceListingController.moderateListing);
router.post('/bulk-delete', authenticate, requireGlobalAdmin, serviceListingController.bulkDeleteListings);

// ── Public / Discovery Routes (Guest & Resident) ─────────────────────────────

router.get('/', optionalAuthenticate, validateQuery(queryListingsSchema), serviceListingController.getAllListings);
router.get('/:id', optionalAuthenticate, serviceListingController.getListingById);

// ── Provider Listing CRUD ────────────────────────────────────────────────────

router.post('/', authenticate, validateBody(createListingSchema), serviceListingController.createListing);
router.put('/:id', authenticate, validateBody(updateListingSchema), serviceListingController.updateListing);
router.patch('/:id/pause', authenticate, serviceListingController.pauseListing);
router.patch('/:id/resume', authenticate, serviceListingController.resumeListing);
router.delete('/:id', authenticate, serviceListingController.deleteListing);

export default router;
