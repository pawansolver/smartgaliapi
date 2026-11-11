import express from 'express';
import { getUserAnalytics, getEngagementAnalytics, getRevenueAnalytics } from './analytics.controller.js';
import { getSearchAnalytics } from '../business_category/business_category.controller.js';
import { authenticate, requireGlobalAdmin } from '../../middleware/auth.middleware.js';

const router = express.Router();

router.get('/users', getUserAnalytics);
router.get('/engagement', getEngagementAnalytics);
router.get('/revenue', getRevenueAnalytics);
router.get('/search', authenticate, requireGlobalAdmin, getSearchAnalytics);

export default router;
