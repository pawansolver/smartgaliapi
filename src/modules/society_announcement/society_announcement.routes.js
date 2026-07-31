import express from 'express';
import * as societyAnnouncementController from './society_announcement.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SocietyAnnouncements
 *   description: Society Announcement management APIs
 */

/**
 * @swagger
 * /api/v1/society-announcement:
 *   post:
 *     summary: Create a new society announcement
 *     tags: [SocietyAnnouncements]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               society_id:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       201:
 *         description: Society announcement created successfully
 */
router.post('/', societyAnnouncementController.createAnnouncement);

/**
 * @swagger
 * /api/v1/society-announcement:
 *   get:
 *     summary: Get all active society announcements
 *     tags: [SocietyAnnouncements]
 *     responses:
 *       200:
 *         description: A list of society announcements
 */
router.get('/', societyAnnouncementController.getAllAnnouncements);

/**
 * @swagger
 * /api/v1/society-announcement/bulk-delete:
 *   post:
 *     summary: Bulk soft delete society announcements
 *     tags: [SocietyAnnouncements]
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
 *         description: Society announcements deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', societyAnnouncementController.bulkDeleteAnnouncements);

/**
 * @swagger
 * /api/v1/society-announcement/{id}:
 *   get:
 *     summary: Get a society announcement by ID
 *     tags: [SocietyAnnouncements]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Society announcement data
 *       404:
 *         description: Society announcement not found
 */
router.get('/:id', societyAnnouncementController.getAnnouncementById);

/**
 * @swagger
 * /api/v1/society-announcement/{id}:
 *   put:
 *     summary: Update a society announcement
 *     tags: [SocietyAnnouncements]
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
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Society announcement updated successfully
 *       404:
 *         description: Society announcement not found
 */
router.put('/:id', societyAnnouncementController.updateAnnouncement);

/**
 * @swagger
 * /api/v1/society-announcement/{id}:
 *   delete:
 *     summary: Soft delete a society announcement
 *     tags: [SocietyAnnouncements]
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
 *         description: Society announcement deleted successfully (soft delete)
 *       404:
 *         description: Society announcement not found
 */
router.delete('/:id', societyAnnouncementController.deleteAnnouncement);

export default router;
