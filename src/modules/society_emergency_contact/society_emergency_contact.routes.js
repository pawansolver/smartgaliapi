import express from 'express';
import * as societyEmergencyContactController from './society_emergency_contact.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createEmergencyContactSchema,
  updateEmergencyContactSchema,
  emergencyAlertSchema,
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
  validateBody(createEmergencyContactSchema),
  societyEmergencyContactController.createEmergencyContact
);

router.get(
  '/',
  authenticate,
  societyReadLimiter,
  requireSocietyMember,
  societyEmergencyContactController.getAllEmergencyContacts
);

router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyEmergencyContactController.getEmergencyContactById
);

router.put(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  validateBody(updateEmergencyContactSchema),
  societyEmergencyContactController.updateEmergencyContact
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  societyEmergencyContactController.deleteEmergencyContact
);

export default router;
