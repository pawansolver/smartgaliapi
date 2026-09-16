import express from 'express';
import * as controller from './super_admin_complaint.controller.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.middleware.js';
import { validateParams } from '../../middleware/validation.middleware.js';
import { idParamSchema } from '../society_profile/society.validation.js';

const router = express.Router();

// All Super Admin complaint oversight routes strictly require authentication + super_admin privileges
router.use(authenticate, requireSuperAdmin);

router.get('/summary', controller.getGlobalSummary);
router.get('/societies', controller.getSocietiesList);
router.get('/audit', controller.getComplaintAuditLogs);
router.get('/audit/logs', controller.getComplaintAuditLogs);
router.get('/', controller.getGlobalComplaints);
router.get('/:id', validateParams(idParamSchema), controller.getGlobalComplaintById);

export default router;
