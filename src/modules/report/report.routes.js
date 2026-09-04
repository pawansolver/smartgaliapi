import express from 'express';
import * as reportController from './report.controller.js';
import { authenticate, requireGlobalAdmin } from '../../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Report management APIs
 */

/** User reporting endpoint - authenticated */
router.post('/', authenticate, reportController.createReport);

/** Administrative report management endpoints - require Global Super Admin */
router.get('/', authenticate, requireGlobalAdmin, reportController.getAllReports);
router.post('/bulk-delete', authenticate, requireGlobalAdmin, reportController.bulkDeleteReports);
router.get('/:id', authenticate, requireGlobalAdmin, reportController.getReportById);
router.put('/:id', authenticate, requireGlobalAdmin, reportController.updateReport);
router.delete('/:id', authenticate, requireGlobalAdmin, reportController.deleteReport);

export default router;
