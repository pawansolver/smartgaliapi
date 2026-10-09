import residentDocumentRoutes from './resident_document.routes.js';
import express from 'express';
import * as societyDocumentController from './society_document.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createDocumentSchema,
  updateDocumentSchema,
  listDocumentQuerySchema,
  createDocumentVersionSchema,
  updateDocumentStatusSchema,
  acknowledgeDocumentSchema,
} from '../society_profile/society.validation.js';
import { requireSocietyMember, requireSocietyRole, requireSocietyPermission } from '../../middleware/societyAuth.middleware.js';
import { uploadSocietyDocument } from '../../utils/fileUpload.js';
import {
  societyReadLimiter,
  societyMutationLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

// Resident Personal Document Vault sub-routes
router.use('/vault', residentDocumentRoutes);

// 1. Create document (Admin & Committee only)
router.post(
  '/',
  authenticate,
  societyMutationLimiter,
  uploadSocietyDocument('society').single('file'),
  requireSocietyPermission('society_document.create'),
  validateBody(createDocumentSchema),
  societyDocumentController.createDocument
);

// 2. List documents (Role-scoped access via service layer)
router.get(
  '/',
  authenticate,
  societyReadLimiter,
  validateQuery(listDocumentQuerySchema),
  requireSocietyMember,
  societyDocumentController.getAllDocuments
);

// 3. Get document details (Strict RBAC in service)
router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyDocumentController.getDocumentById
);

// Download document (Strict RBAC in service)
router.get(
  '/:id/download',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyDocumentController.downloadDocument
);

// 4. Update document metadata (Admin & Authorized Reviewers)
router.put(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('society_document.review'),
  validateBody(updateDocumentSchema),
  societyDocumentController.updateDocument
);

// 5. Create new version (Admin & Authorized Version Managers)
router.post(
  '/:id/versions',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  uploadSocietyDocument('society').single('file'),
  requireSocietyPermission('society_document.version_manage'),
  validateBody(createDocumentVersionSchema),
  societyDocumentController.createVersion
);

// 6. Get version history (All society members with read access)
router.get(
  '/:id/versions',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyDocumentController.getVersions
);

// 7. Lifecycle status update (Draft -> Under Review -> Approved -> Published -> Archived)
router.patch(
  '/:id/status',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  validateBody(updateDocumentStatusSchema),
  societyDocumentController.updateDocumentStatus
);

// 8. Resident acknowledgement
router.post(
  '/:id/acknowledge',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  validateBody(acknowledgeDocumentSchema),
  societyDocumentController.acknowledgeDocument
);

// 9. View acknowledgements (Admin & Authorized Reviewers)
router.get(
  '/:id/acknowledgements',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('society_document.review'),
  societyDocumentController.getAcknowledgements
);

// 10. Audit history (Admin & Authorized Reviewers)
router.get(
  '/:id/audit-history',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyPermission('society_document.review'),
  societyDocumentController.getAuditHistory
);

// 11. Soft delete document (Admin only)
router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  societyDocumentController.deleteDocument
);

export default router;
