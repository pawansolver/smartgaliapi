import express from 'express';
import { getUserAnalytics, getEngagementAnalytics, getRevenueAnalytics } from './analytics.controller.js';

const router = express.Router();

router.get('/users', getUserAnalytics);
router.get('/engagement', getEngagementAnalytics);
router.get('/revenue', getRevenueAnalytics);

export default router;
