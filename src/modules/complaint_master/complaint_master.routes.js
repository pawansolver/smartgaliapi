import express from 'express';
import * as controller from './complaint_master.controller.js';
import { authenticate, optionalAuthenticate, requireSuperAdmin } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../../middleware/validation.middleware.js';
import { idParamSchema } from '../society_profile/society.validation.js';
import {
  createCategorySchema,
  updateCategorySchema,
  createSubCategorySchema,
  updateSubCategorySchema,
  createLocationTypeSchema,
  updateLocationTypeSchema,
  toggleStatusSchema,
  reorderMasterSchema,
} from './complaint_master.validation.js';

// ── 1. Dedicated Category Sub-Router ──────────────────────────────────────────
export const categoryRouter = express.Router();
categoryRouter.get('/', optionalAuthenticate, controller.listCategories);
categoryRouter.get('/:id', optionalAuthenticate, validateParams(idParamSchema), controller.getCategoryById);
categoryRouter.post('/', authenticate, requireSuperAdmin, validateBody(createCategorySchema), controller.createCategory);
categoryRouter.put('/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(updateCategorySchema), controller.updateCategory);
categoryRouter.patch('/:id/status', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(toggleStatusSchema), controller.toggleCategoryStatus);
categoryRouter.patch('/reorder', authenticate, requireSuperAdmin, validateBody(reorderMasterSchema), (req, res, next) => {
  req.params.type = 'category';
  return controller.reorderItems(req, res, next);
});
categoryRouter.delete('/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), controller.deleteCategory);

// ── 2. Dedicated Sub-Category Sub-Router ──────────────────────────────────────
export const subCategoryRouter = express.Router();
subCategoryRouter.get('/', optionalAuthenticate, controller.listSubCategories);
subCategoryRouter.get('/:id', optionalAuthenticate, validateParams(idParamSchema), controller.getSubCategoryById);
subCategoryRouter.post('/', authenticate, requireSuperAdmin, validateBody(createSubCategorySchema), controller.createSubCategory);
subCategoryRouter.put('/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(updateSubCategorySchema), controller.updateSubCategory);
subCategoryRouter.patch('/:id/status', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(toggleStatusSchema), controller.toggleSubCategoryStatus);
subCategoryRouter.patch('/reorder', authenticate, requireSuperAdmin, validateBody(reorderMasterSchema), (req, res, next) => {
  req.params.type = 'sub_category';
  return controller.reorderItems(req, res, next);
});
subCategoryRouter.delete('/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), controller.deleteSubCategory);

// ── 3. Dedicated Location Type Sub-Router ─────────────────────────────────────
export const locationTypeRouter = express.Router();
locationTypeRouter.get('/', optionalAuthenticate, controller.listLocationTypes);
locationTypeRouter.get('/:id', optionalAuthenticate, validateParams(idParamSchema), controller.getLocationTypeById);
locationTypeRouter.post('/', authenticate, requireSuperAdmin, validateBody(createLocationTypeSchema), controller.createLocationType);
locationTypeRouter.put('/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(updateLocationTypeSchema), controller.updateLocationType);
locationTypeRouter.patch('/:id/status', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(toggleStatusSchema), controller.toggleLocationTypeStatus);
locationTypeRouter.patch('/reorder', authenticate, requireSuperAdmin, validateBody(reorderMasterSchema), (req, res, next) => {
  req.params.type = 'location_type';
  return controller.reorderItems(req, res, next);
});
locationTypeRouter.delete('/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), controller.deleteLocationType);

// ── 4. Unified /complaint-masters Router ───────────────────────────────────────
const router = express.Router();

// Master Queries
router.get('/categories', optionalAuthenticate, controller.listCategories);
router.get('/categories/:id', optionalAuthenticate, validateParams(idParamSchema), controller.getCategoryById);

router.get('/sub-categories', optionalAuthenticate, controller.listSubCategories);
router.get('/sub-categories/:id', optionalAuthenticate, validateParams(idParamSchema), controller.getSubCategoryById);

router.get('/location-types', optionalAuthenticate, controller.listLocationTypes);
router.get('/location-types/:id', optionalAuthenticate, validateParams(idParamSchema), controller.getLocationTypeById);

// Admin Mutations
router.post('/admin/categories', authenticate, requireSuperAdmin, validateBody(createCategorySchema), controller.createCategory);
router.put('/admin/categories/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(updateCategorySchema), controller.updateCategory);
router.patch('/admin/categories/:id/status', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(toggleStatusSchema), controller.toggleCategoryStatus);
router.delete('/admin/categories/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), controller.deleteCategory);

router.post('/admin/sub-categories', authenticate, requireSuperAdmin, validateBody(createSubCategorySchema), controller.createSubCategory);
router.put('/admin/sub-categories/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(updateSubCategorySchema), controller.updateSubCategory);
router.patch('/admin/sub-categories/:id/status', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(toggleStatusSchema), controller.toggleSubCategoryStatus);
router.delete('/admin/sub-categories/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), controller.deleteSubCategory);

router.post('/admin/location-types', authenticate, requireSuperAdmin, validateBody(createLocationTypeSchema), controller.createLocationType);
router.put('/admin/location-types/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(updateLocationTypeSchema), controller.updateLocationType);
router.patch('/admin/location-types/:id/status', authenticate, requireSuperAdmin, validateParams(idParamSchema), validateBody(toggleStatusSchema), controller.toggleLocationTypeStatus);
router.delete('/admin/location-types/:id', authenticate, requireSuperAdmin, validateParams(idParamSchema), controller.deleteLocationType);

router.put('/admin/reorder/:type', authenticate, requireSuperAdmin, validateBody(reorderMasterSchema), controller.reorderItems);

export default router;
