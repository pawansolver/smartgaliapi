import express from 'express';
import * as societyProfileController from './society_profile.controller.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createSocietyProfileSchema,
  updateSocietyProfileSchema,
  listSocietyProfileQuerySchema,
  transferOwnershipSchema,
} from './society.validation.js';
import { requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import {
  societyReadLimiter,
  societyMutationLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post(
  '/',
  authenticate,
  societyMutationLimiter,
  validateBody(createSocietyProfileSchema),
  societyProfileController.createProfile
);

router.get(
  '/',
  optionalAuthenticate,
  societyReadLimiter,
  validateQuery(listSocietyProfileQuerySchema),
  societyProfileController.getAllProfiles
);

router.get(
  '/:id',
  optionalAuthenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  societyProfileController.getProfileById
);

router.put(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  validateBody(updateSocietyProfileSchema),
  societyProfileController.updateProfile
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  societyProfileController.deleteProfile
);

router.post(
  '/:id/transfer-ownership',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  validateBody(transferOwnershipSchema),
  societyProfileController.transferOwnership
);

export default router;
