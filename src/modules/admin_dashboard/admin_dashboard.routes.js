import express from 'express';
import { getDashboardStats, getRecentActivities, getAnalyticsData } from './admin_dashboard.controller.js';

const router = express.Router();

router.get('/stats', getDashboardStats);
router.get('/recent-activities', getRecentActivities);
router.get('/analytics', getAnalyticsData);

export default router;
