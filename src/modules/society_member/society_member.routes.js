import express from 'express';
import * as societyMemberController from './society_member.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createSocietyMemberSchema,
  updateSocietyMemberSchema,
  updateMemberRoleSchema,
  memberApprovalSchema,
  listSocietyMemberQuerySchema,
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
  validateBody(createSocietyMemberSchema),
  societyMemberController.createMember
);

router.get(
  '/',
  authenticate,
  societyReadLimiter,
  validateQuery(listSocietyMemberQuerySchema),
  requireSocietyMember,
  societyMemberController.getAllMembers
);

router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyMemberController.getMemberById
);

router.put(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  validateBody(updateSocietyMemberSchema),
  societyMemberController.updateMember
);

router.put(
  '/:id/role',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  validateBody(updateMemberRoleSchema),
  societyMemberController.updateMemberRole
);

router.put(
  '/:id/approve',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  validateBody(memberApprovalSchema),
  societyMemberController.approveMember
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  societyMemberController.deleteMember
);

export default router;
