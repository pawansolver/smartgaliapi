import express from 'express';
import { getDashboardStats, getRecentActivities, getAnalyticsData } from './admin_dashboard.controller.js';
import { authenticate, requireGlobalAdmin } from '../../middleware/auth.middleware.js';

const router = express.Router();

router.get('/stats', authenticate, requireGlobalAdmin, getDashboardStats);
router.get('/recent-activities', authenticate, requireGlobalAdmin, getRecentActivities);
router.get('/analytics', authenticate, requireGlobalAdmin, getAnalyticsData);

export default router;
