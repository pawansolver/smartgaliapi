import express from 'express';
import * as societyPollController from './society_poll.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createPollSchema,
  updatePollSchema,
  votePollSchema,
  listPollQuerySchema,
} from '../society_profile/society.validation.js';
import { requireSocietyMember, requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import {
  societyReadLimiter,
  societyMutationLimiter,
  societyPollVoteLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post(
  '/',
  authenticate,
  societyMutationLimiter,
  requireSocietyRole(['admin', 'committee']),
  validateBody(createPollSchema),
  societyPollController.createPoll
);

router.get(
  '/',
  authenticate,
  societyReadLimiter,
  validateQuery(listPollQuerySchema),
  requireSocietyMember,
  societyPollController.getAllPolls
);

router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyPollController.getPollById
);

router.post(
  '/:id/vote',
  authenticate,
  societyPollVoteLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  validateBody(votePollSchema),
  societyPollController.votePoll
);

router.put(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  validateBody(updatePollSchema),
  societyPollController.updatePoll
);

router.put(
  '/:id/status',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  societyPollController.updatePollStatus
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  societyPollController.deletePoll
);

export default router;
