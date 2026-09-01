import express from 'express';
import * as societyComplaintController from './society_complaint.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createComplaintSchema,
  updateComplaintStatusSchema,
  assignComplaintSchema,
  listComplaintQuerySchema,
} from '../society_profile/society.validation.js';
import { requireSocietyMember, requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import {
  societyReadLimiter,
  societyComplaintLimiter,
  societyMutationLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post(
  '/',
  authenticate,
  societyComplaintLimiter,
  validateBody(createComplaintSchema),
  requireSocietyMember,
  societyComplaintController.createComplaint
);

router.get(
  '/',
  authenticate,
  societyReadLimiter,
  validateQuery(listComplaintQuerySchema),
  requireSocietyMember,
  societyComplaintController.getAllComplaints
);

router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyComplaintController.getComplaintById
);

router.put(
  '/:id/status',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  validateBody(updateComplaintStatusSchema),
  societyComplaintController.updateComplaintStatus
);

router.put(
  '/:id/assign',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  validateBody(assignComplaintSchema),
  societyComplaintController.assignComplaint
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  societyComplaintController.deleteComplaint
);

export default router;
