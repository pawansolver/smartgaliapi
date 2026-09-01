import express from 'express';
import * as societyVisitorController from './society_visitor.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createVisitorSchema,
  updateVisitorSchema,
  updateVisitorStatusSchema,
  listVisitorQuerySchema,
} from '../society_profile/society.validation.js';
import { requireSocietyMember, requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import {
  societyReadLimiter,
  societyVisitorLimiter,
  societyMutationLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post(
  '/',
  authenticate,
  societyVisitorLimiter,
  validateBody(createVisitorSchema),
  requireSocietyMember,
  societyVisitorController.createVisitor
);

router.get(
  '/',
  authenticate,
  societyReadLimiter,
  validateQuery(listVisitorQuerySchema),
  requireSocietyMember,
  societyVisitorController.getAllVisitors
);

router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyVisitorController.getVisitorById
);

router.put(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  validateBody(updateVisitorSchema),
  societyVisitorController.updateVisitor
);

router.put(
  '/:id/status',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  validateBody(updateVisitorStatusSchema),
  societyVisitorController.updateVisitorStatus
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'security']),
  societyVisitorController.deleteVisitor
);

export default router;
