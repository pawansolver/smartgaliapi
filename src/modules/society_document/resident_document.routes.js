import express from 'express';
import * as residentDocController from './resident_document.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateParams } from '../../middleware/validation.middleware.js';
import { idParamSchema } from '../society_profile/society.validation.js';
import { requireSocietyMember } from '../../middleware/societyAuth.middleware.js';
import { uploadSocietyDocument } from '../../utils/fileUpload.js';
import { societyReadLimiter, societyMutationLimiter } from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

// 1. Upload personal document into resident vault
router.post(
  '/',
  authenticate,
  societyMutationLimiter,
  requireSocietyMember,
  uploadSocietyDocument('society').single('file'),
  residentDocController.uploadResidentDocument
);

// 2. List resident's personal documents (Vault)
router.get(
  '/me',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  residentDocController.getMyDocuments
);

// 3. List shared resident documents (Admin / Committee Verifier view)
router.get(
  '/shared',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  residentDocController.getSharedDocuments
);

// 4. Get single personal document details (Object-level authorization enforced)
router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  residentDocController.getDocumentById
);

// 5. Download personal document (Access-controlled)
router.get(
  '/:id/download',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  residentDocController.downloadResidentDocument
);

// 6. Share private document for admin verification
router.patch(
  '/:id/share',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  residentDocController.shareForVerification
);

// 7. Verify or reject resident personal document (Admin/Committee Verifier only)
router.patch(
  '/:id/verify',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  residentDocController.verifyResidentDocument
);

// 8. Soft delete personal document from vault (Owner only)
router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  residentDocController.deleteResidentDocument
);

export default router;
