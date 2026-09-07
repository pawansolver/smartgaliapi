import express from 'express';
import * as roleController from './role.controller.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.middleware.js';

const router = express.Router();

// System Administration (PRD 19.11: Create Roles, Assign Permissions) - Super Admin ONLY
router.use(authenticate, requireSuperAdmin);

router.post('/', roleController.createRole);
router.get('/', roleController.getAllRoles);
router.get('/:id', roleController.getRoleById);
router.put('/:id', roleController.updateRole);
router.delete('/:id', roleController.deleteRole);

// Role Permissions endpoints
router.get('/:id/permissions', roleController.getRolePermissions);
router.put('/:id/permissions', roleController.updateRolePermissions);

export default router;
