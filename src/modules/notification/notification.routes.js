import express from 'express';
import * as notificationController from './notification.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Notification management APIs
 */

/**
 * @swagger
 * /api/v1/notification:
 *   post:
 *     summary: Create a new notification
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - message
 *             properties:
 *               user_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [info, alert, reminder, message, system]
 *               data:
 *                 type: object
 *               is_read:
 *                 type: boolean
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Notification created successfully
 */
router.post('/', notificationController.createNotification);

/**
 * @swagger
 * /api/v1/notification:
 *   get:
 *     summary: Get all active notifications
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: A list of notifications
 */
router.get('/', notificationController.getAllNotifications);

/**
 * @swagger
 * /api/v1/notification/me:
 *   get:
 *     summary: Get the authenticated user's notifications (paginated, real-time)
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: The user's notification feed with unread count
 */
router.get('/me', notificationController.getMyNotifications);

/**
 * @swagger
 * /api/v1/notification/me/unread-count:
 *   get:
 *     summary: Get the authenticated user's unread notification count (badge poller)
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: The unread notification count
 */
router.get('/me/unread-count', notificationController.getMyUnreadCount);

/**
 * @swagger
 * /api/v1/notification/me/read-all:
 *   patch:
 *     summary: Mark all of the authenticated user's notifications as read
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Number of notifications marked as read
 */
router.patch('/me/read-all', notificationController.markAllNotificationsRead);

/**
 * @swagger
 * /api/v1/notification/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read (owner only)
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
router.patch('/:id/read', notificationController.markNotificationRead);

/**
 * @swagger
 * /api/v1/notification/broadcast:
 *   post:
 *     summary: Broadcast a notification to all active users
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - message
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               created_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Broadcast sent successfully
 */
router.post('/broadcast', notificationController.sendBroadcast);

/**
 * @swagger
 * /api/v1/notification/email:
 *   post:
 *     summary: Send and log an email notification
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *               - subject
 *               - body
 *             properties:
 *               user_id:
 *                 type: integer
 *               subject:
 *                 type: string
 *               body:
 *                 type: string
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Email sent and logged successfully
 */
router.post('/email', notificationController.sendEmail);

/**
 * @swagger
 * /api/v1/notification/email:
 *   get:
 *     summary: Get all email notification logs
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: A list of email logs
 */
router.get('/email', notificationController.getAllEmails);

/**
 * @swagger
 * /api/v1/notification/bulk-delete:
 *   post:
 *     summary: Bulk soft delete notifications
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               deletedRemarks:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Notifications deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', notificationController.bulkDeleteNotifications);

/**
 * @swagger
 * /api/v1/notification/{id}:
 *   get:
 *     summary: Get a notification by ID
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notification data
 *       404:
 *         description: Notification not found
 */
router.get('/:id', notificationController.getNotificationById);

/**
 * @swagger
 * /api/v1/notification/{id}:
 *   put:
 *     summary: Update a notification
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_read:
 *                 type: boolean
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Notification updated successfully
 *       404:
 *         description: Notification not found
 */
router.put('/:id', notificationController.updateNotification);

/**
 * @swagger
 * /api/v1/notification/{id}:
 *   delete:
 *     summary: Soft delete a notification
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deletedRemarks:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Notification deleted successfully (soft delete)
 *       404:
 *         description: Notification not found
 */
router.delete('/:id', notificationController.deleteNotification);



export default router;
