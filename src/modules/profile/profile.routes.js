import express from 'express';
import * as profileController from './profile.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validate,
  updateProfileSchema,
  addressSchema,
  supportTicketSchema,
  dataExportRequestSchema,
  notificationPreferencesSchema,
  privacySettingsSchema,
  changePasswordSchema,
  deleteAccountSchema,
} from './profile.validation.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Profile
 *     description: Authenticated user profile, addresses, preferences & security APIs
 */

// Every route below requires a valid JWT
router.use(authenticate);

/**
 * @swagger
 * /api/v1/profile/me:
 *   get:
 *     summary: Get the logged-in user's full profile aggregate
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profile fetched successfully }
 *       404: { description: Profile not found }
 */
router.get('/me', profileController.getMe);

/**
 * @swagger
 * /api/v1/profile/me:
 *   put:
 *     summary: Update profile details (name, email, bio, avatar, location)
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Profile updated successfully }
 *       409: { description: Email already in use }
 *       422: { description: Validation failed }
 */
router.put('/me', validate(updateProfileSchema), profileController.updateMe);

/**
 * @swagger
 * /api/v1/profile/me/avatar:
 *   post:
 *     summary: Upload/replace profile avatar image
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200: { description: Avatar updated successfully }
 */
router.post('/me/avatar', profileController.uploadAvatar);

/**
 * @swagger
 * /api/v1/profile/addresses:
 *   get:
 *     summary: List saved addresses
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Addresses fetched successfully }
 *   post:
 *     summary: Add a new address
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Address added successfully }
 */
router.get('/addresses', profileController.listAddresses);
router.post('/addresses', validate(addressSchema), profileController.addAddress);

/**
 * @swagger
 * /api/v1/profile/addresses/{id}:
 *   put:
 *     summary: Update an address
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Address updated successfully }
 *       404: { description: Address not found }
 *   delete:
 *     summary: Delete an address (soft delete)
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Address deleted successfully }
 *       404: { description: Address not found }
 */
router.put('/addresses/:id', validate(addressSchema), profileController.editAddress);
router.delete('/addresses/:id', profileController.removeAddress);

/**
 * @swagger
 * /api/v1/profile/addresses/{id}/default:
 *   patch:
 *     summary: Set an address as the default
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Default address set successfully }
 *       404: { description: Address not found }
 */
router.patch('/addresses/:id/default', profileController.makeAddressDefault);

/**
 * @swagger
 * /api/v1/profile/society:
 *   get:
 *     summary: Get the authenticated user's active society membership
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Active society fetched, or null when not linked }
 */
router.get('/society', profileController.getSociety);

/**
 * @swagger
 * /api/v1/profile/support-tickets:
 *   post:
 *     summary: Submit a profile support ticket
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, description]
 *             properties:
 *               category: { type: string, maxLength: 80 }
 *               description: { type: string, minLength: 10, maxLength: 5000 }
 *     responses:
 *       201: { description: Support ticket submitted }
 *       422: { description: Validation failed }
 */
router.post('/support-tickets', validate(supportTicketSchema), profileController.createSupportTicket);

/**
 * @swagger
 * /api/v1/profile/data-export-requests:
 *   post:
 *     summary: Request an export of the authenticated user's data
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Data export request submitted }
 *       409: { description: A pending or processing request already exists }
 */
router.post(
  '/data-export-requests',
  validate(dataExportRequestSchema),
  profileController.createDataExportRequest
);

/**
 * @swagger
 * /api/v1/profile/notification-preferences:
 *   get:
 *     summary: Get notification preferences (auto-creates defaults)
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Notification preferences fetched successfully }
 *   put:
 *     summary: Update notification preferences
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Notification preferences updated successfully }
 */
router.get('/notification-preferences', profileController.getNotificationPreferences);
router.put('/notification-preferences', validate(notificationPreferencesSchema), profileController.updateNotificationPreferences);

/**
 * @swagger
 * /api/v1/profile/privacy-settings:
 *   get:
 *     summary: Get privacy settings (auto-creates defaults)
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Privacy settings fetched successfully }
 *   put:
 *     summary: Update privacy settings
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Privacy settings updated successfully }
 */
router.get('/privacy-settings', profileController.getPrivacySettings);
router.put('/privacy-settings', validate(privacySettingsSchema), profileController.updatePrivacySettings);

/**
 * @swagger
 * /api/v1/profile/change-password:
 *   put:
 *     summary: Set or change account password
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Password updated successfully }
 *       400: { description: Current password incorrect/required }
 */
router.put('/change-password', validate(changePasswordSchema), profileController.changePassword);

/**
 * @swagger
 * /api/v1/profile/me:
 *   delete:
 *     summary: Delete (deactivate) the account permanently
 *     tags: [Profile]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Account deleted successfully }
 *       400: { description: Password required/incorrect or not confirmed }
 */
router.delete('/me', validate(deleteAccountSchema), profileController.deleteAccount);

export default router;
