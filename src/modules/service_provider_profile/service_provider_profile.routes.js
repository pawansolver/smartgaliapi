import express from 'express';
import * as serviceProviderProfileController from './service_provider_profile.controller.js';
import { authenticate, optionalAuthenticate, requireGlobalAdmin } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import { uploadProviderDocument } from '../../utils/fileUpload.js';
import {
  updateProviderProfileSchema,
  updateServiceAreaSchema,
  updateAvailabilitySchema,
  verifyProviderSchema,
  uploadProviderDocumentSchema,
  verifyProviderDocumentSchema,
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

// Document upload middleware helper supporting both 'file' and 'document' multipart keys
const providerDocUpload = uploadProviderDocument('provider-documents').fields([
  { name: 'file', maxCount: 1 },
  { name: 'document', maxCount: 1 },
]);

const extractUploadedDoc = (req, res, next) => {
  providerDocUpload(req, res, (err) => {
    if (err) return next(err);
    if (req.files) {
      req.file = req.files['file']?.[0] || req.files['document']?.[0] || null;
    }
    next();
  });
};

/**
 * @swagger
 * tags:
 *   name: ServiceProviderProfiles
 *   description: Enterprise Service Provider Profile and Availability APIs
 */

// â”€â”€ Provider Own Workspace Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/me', authenticate, serviceProviderProfileController.getMyProfile);
router.put('/me', authenticate, validateBody(updateProviderProfileSchema), serviceProviderProfileController.updateMyProfile);

router.get('/me/service-area', authenticate, serviceProviderProfileController.getMyServiceArea);
router.put('/me/service-area', authenticate, validateBody(updateServiceAreaSchema), serviceProviderProfileController.updateMyServiceArea);

router.get('/me/availability', authenticate, serviceProviderProfileController.getMyAvailability);
router.put('/me/availability', authenticate, validateBody(updateAvailabilitySchema), serviceProviderProfileController.updateMyAvailability);

router.get('/me/overview-stats', authenticate, serviceProviderProfileController.getMyOverviewStats);
router.get('/me/earnings', authenticate, serviceProviderProfileController.getMyEarnings);

// â”€â”€ Provider Own Documents (KYC) Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/me/required-documents', authenticate, serviceProviderProfileController.getMyRequiredDocuments);
router.get('/me/documents', authenticate, serviceProviderProfileController.getMyDocuments);
router.post('/me/documents', authenticate, extractUploadedDoc, validateBody(uploadProviderDocumentSchema), serviceProviderProfileController.uploadMyDocument);
router.delete('/me/documents/:documentId', authenticate, serviceProviderProfileController.deleteMyDocument);

// â”€â”€ Admin Moderation & Verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/status/pending-verification', authenticate, requireGlobalAdmin, serviceProviderProfileController.getPendingVerifications);
router.get('/:id/documents', authenticate, devAdminCheck, serviceProviderProfileController.getProviderDocumentsForAdmin);
router.put('/:id/verify', optionalAuthenticate, devAdminCheck, validateBody(verifyProviderSchema), serviceProviderProfileController.verifyProfile);
router.put('/documents/:documentId/verify', authenticate, requireGlobalAdmin, validateBody(verifyProviderDocumentSchema), serviceProviderProfileController.verifyProviderDocument);
router.post('/bulk-delete', authenticate, requireGlobalAdmin, serviceProviderProfileController.bulkDeleteProfiles);

// â”€â”€ Public / Shared Provider Profile Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/', optionalAuthenticate, serviceProviderProfileController.getAllProfiles);
router.get('/:id', optionalAuthenticate, serviceProviderProfileController.getProfileById);
router.put('/:id', authenticate, validateBody(updateProviderProfileSchema), serviceProviderProfileController.updateProfile);
router.delete('/:id', authenticate, serviceProviderProfileController.deleteProfile);

export default router;
