import express from 'express';
import * as societyFacilityController from './society_facility.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createFacilitySchema,
  updateFacilitySchema,
  listFacilityQuerySchema,
} from '../society_profile/society.validation.js';
import { requireSocietyMember, requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
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
  validateBody(createFacilitySchema),
  societyFacilityController.createFacility
);

router.get(
  '/',
  authenticate,
  societyReadLimiter,
  validateQuery(listFacilityQuerySchema),
  requireSocietyMember,
  societyFacilityController.getAllFacilities
);

router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyFacilityController.getFacilityById
);

router.put(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  validateBody(updateFacilitySchema),
  societyFacilityController.updateFacility
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  societyFacilityController.deleteFacility
);

export default router;
