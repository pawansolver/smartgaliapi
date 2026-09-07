import express from 'express';
import * as userController from './user.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';
import { authenticate, requireSuperAdmin } from '../../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticate);

// Admin User Management (Super Admin Exclusive APIs)
router.get('/admin-users', requireSuperAdmin, userController.listAdminUsers);
router.post('/admin-users', requireSuperAdmin, userController.createAdminUser);
router.put('/admin-users/:id', requireSuperAdmin, userController.updateAdminUser);
router.put('/admin-users/:id/deactivate', requireSuperAdmin, userController.deactivateAdminUser);

// User CRUD
router.post('/', uploadImage('user').single('profile_image'), userController.createUser);
router.get('/', userController.getAllUsers);
router.get('/status/pending-verification', userController.getPendingUsers);
router.get('/status/blocked', userController.getBlockedUsersList);
router.get('/:id', userController.getUserById);
router.put('/:id', uploadImage('user').single('profile_image'), userController.updateUser);
router.delete('/:id', userController.deleteUser);
router.put('/:id/block', userController.blockUser);
router.put('/:id/unblock', userController.unblockUser);
router.put('/:id/verify', userController.verifyUser);
router.put('/:id/mute', userController.muteUser);
router.put('/:id/unmute', userController.unmuteUser);

// PBAC User Roles & User Direct Permissions (Super Admin Exclusive for system-level security administration)
router.get('/:id/roles', requireSuperAdmin, userController.getUserRoles);
router.put('/:id/roles', requireSuperAdmin, userController.updateUserRoles);
router.get('/:id/permissions', requireSuperAdmin, userController.getUserPermissions);
router.put('/:id/permissions', requireSuperAdmin, userController.updateUserPermissions);
router.delete('/:id/permissions/:permissionId', requireSuperAdmin, userController.deleteUserPermission);

export default router;
