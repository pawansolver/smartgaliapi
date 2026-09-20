import express from 'express';
import * as workerController from './society_worker.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import { societyReadLimiter, societyMutationLimiter } from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

router.get('/', authenticate, societyReadLimiter, requireSocietyRole(['admin', 'committee']), workerController.getAuthorizedWorkers);
router.get('/eligible', authenticate, societyReadLimiter, requireSocietyRole(['admin', 'committee']), workerController.getEligibleAssignees);
router.post('/', authenticate, societyMutationLimiter, requireSocietyRole(['admin']), workerController.authorizeWorker);
router.put('/:id', authenticate, societyMutationLimiter, requireSocietyRole(['admin']), workerController.updateWorkerAuthorization);
router.delete('/:id', authenticate, societyMutationLimiter, requireSocietyRole(['admin']), workerController.revokeWorkerAuthorization);

export default router;
