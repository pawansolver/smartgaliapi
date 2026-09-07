import express from 'express';
import * as permissionController from './permission.controller.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.middleware.js';

const router = express.Router();

// Current authenticated user's permissions and check endpoints
router.get('/my-permissions', authenticate, permissionController.getMyPermissions);
router.post('/check', authenticate, permissionController.checkPermission);

// Permission Catalog & System Registry APIs - Super Admin Exclusive (PRD 19.11)
router.use(authenticate, requireSuperAdmin);

router.get('/', permissionController.getAllPermissions);
router.get('/:id', permissionController.getPermissionById);
router.post('/', permissionController.createPermission);
router.put('/:id', permissionController.updatePermission);
router.delete('/:id', permissionController.deletePermission);

export default router;
