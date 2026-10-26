import express from 'express';
import * as serviceConfigController from './service_config.controller.js';
import { authenticate, optionalAuthenticate, isSuperAdminUser } from '../../middleware/auth.middleware.js';
import { hasPermission } from '../permission/permission.service.js';
import { errorResponse } from '../../utils/response.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import { masterItemSchema, updateMasterItemSchema, toggleMasterStatusSchema } from './service_config.validation.js';
import env from '../../config/env.js';

const router = express.Router();

/**
 * Authorization Guard for Service Master Configuration Management
 * Super Admin (R001) or Admin (R002) with 'service_config.manage' permission.
 * In development mode: bypass allowed for smooth developer testing.
 */
export const requireServiceConfigManage = async (req, res, next) => {
  if (!req.user || (!req.user.id && !req.user.userId)) {
    return errorResponse(res, 401, 'Authentication required.');
  }

  // Super Admin always has full access
  if (isSuperAdminUser(req.user) || req.user.userRole === 'super_admin' || req.user.role === 'super_admin') {
    return next();
  }

  // Explicit PBAC permission check
  const allowed = (await hasPermission(req.user, 'service_config.manage')) || (await hasPermission(req.user, 'service.manage'));
  if (allowed) {
    return next();
  }

  return errorResponse(res, 403, "Forbidden: 'service_config.manage' permission required. Providers and Residents cannot manage masters.");
};

// ── Dynamic Booking Flow & Authoritative Pricing Governance (Super Admin Managed) ──
router.get('/booking-governance', optionalAuthenticate, serviceConfigController.getBookingGovernance);
router.put('/booking-governance', authenticate, requireServiceConfigManage, serviceConfigController.updateBookingGovernance);

// ── Public / Provider Read APIs ─────────────────────────────────────────────
router.get('/all', optionalAuthenticate, serviceConfigController.getAllMasters);
router.get('/:masterType', optionalAuthenticate, serviceConfigController.getMasterCollection);

// Specific Named Master Endpoints
const namedMasters = [
  'pricing-models',
  'pricing-units',
  'durations',
  'buffer-options',
  'inspection-fee-types',
  'inspection-adjustments',
  'package-levels',
  'addon-types',
  'material-policies',
  'charge-types',
  'warranty-options',
  'execution-methods',
  'area-types',
  'radius-options',
  'slot-durations',
  'booking-capacities'
];

namedMasters.forEach(name => {
  router.get(`/${name}`, optionalAuthenticate, (req, res, next) => {
    req.params.masterType = name;
    return serviceConfigController.getMasterCollection(req, res, next);
  });
});

// ── Admin Master Management APIs ───────────────────────────────────────────
router.post(
  '/:masterType',
  authenticate,
  requireServiceConfigManage,
  validateBody(masterItemSchema),
  serviceConfigController.createMasterItem
);

router.put(
  '/:masterType/:id',
  authenticate,
  requireServiceConfigManage,
  validateBody(updateMasterItemSchema),
  serviceConfigController.updateMasterItem
);

router.patch(
  '/:masterType/:id/status',
  authenticate,
  requireServiceConfigManage,
  validateBody(toggleMasterStatusSchema),
  serviceConfigController.toggleMasterStatus
);

router.delete(
  '/:masterType/:id',
  authenticate,
  requireServiceConfigManage,
  serviceConfigController.deleteMasterItem
);

export default router;
