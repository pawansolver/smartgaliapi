import express from 'express';
import * as societyDocumentController from './society_document.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createDocumentSchema,
  updateDocumentSchema,
  listDocumentQuerySchema,
} from '../society_profile/society.validation.js';
import { requireSocietyMember, requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import { uploadSocietyDocument } from '../../utils/fileUpload.js';
import {
  societyReadLimiter,
  societyMutationLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post(
  '/',
  authenticate,
  societyMutationLimiter,
  requireSocietyRole(['admin', 'committee']),
  uploadSocietyDocument('society').single('file'),
  validateBody(createDocumentSchema),
  societyDocumentController.createDocument
);

router.get(
  '/',
  authenticate,
  societyReadLimiter,
  validateQuery(listDocumentQuerySchema),
  requireSocietyMember,
  societyDocumentController.getAllDocuments
);

router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyDocumentController.getDocumentById
);

router.put(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  validateBody(updateDocumentSchema),
  societyDocumentController.updateDocument
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  societyDocumentController.deleteDocument
);

export default router;
