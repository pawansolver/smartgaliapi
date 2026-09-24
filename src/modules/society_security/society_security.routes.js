import express from 'express';
import * as securityCtrl from './society_security.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireSocietyPermission } from '../../middleware/societyAuth.middleware.js';

const router = express.Router();
router.use(authenticate);

// Dashboard / Metrics
router.get('/dashboard', requireSocietyPermission('security.dashboard'), securityCtrl.getDashboard);
router.get('/metrics', requireSocietyPermission('security.dashboard'), securityCtrl.getDashboard);

// Reports
router.get('/reports', requireSocietyPermission('security.reports'), securityCtrl.getReports);

// Audit Logs
router.get('/audit-logs', requireSocietyPermission('security.reports'), securityCtrl.getAuditLogs);
router.get('/audit', requireSocietyPermission('security.reports'), securityCtrl.getAuditLogs);

export default router;
