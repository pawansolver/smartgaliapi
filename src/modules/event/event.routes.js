import express from 'express';
import * as eventController from './event.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Events
 *   description: Event management APIs
 */

/**
 * @swagger
 * /api/v1/event:
 *   post:
 *     summary: Create a new event
 *     tags: [Events]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               created_by:
 *                 type: integer
 *               community_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               location:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               start_at:
 *                 type: string
 *                 format: date-time
 *               end_at:
 *                 type: string
 *                 format: date-time
 *               event_type:
 *                 type: string
 *                 enum: [online, offline, hybrid]
 *               cover_image:
 *                 type: string
 *     responses:
 *       201:
 *         description: Event created successfully
 */
router.post('/', uploadImage('event').single('cover_image'), eventController.createEvent);

/**
 * @swagger
 * /api/v1/event:
 *   get:
 *     summary: Get all active events
 *     tags: [Events]
 *     responses:
 *       200:
 *         description: A list of events
 */
router.get('/', eventController.getAllEvents);

/**
 * @swagger
 * /api/v1/event/bulk-delete:
 *   post:
 *     summary: Bulk soft delete events
 *     tags: [Events]
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
 *         description: Events deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', eventController.bulkDeleteEvents);

/**
 * @swagger
 * /api/v1/event/{id}:
 *   get:
 *     summary: Get an event by ID
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Event data
 *       404:
 *         description: Event not found
 */
router.get('/:id', eventController.getEventById);

/**
 * @swagger
 * /api/v1/event/{id}:
 *   put:
 *     summary: Update an event
 *     tags: [Events]
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
 *               description:
 *                 type: string
 *               location:
 *                 type: string
 *               event_type:
 *                 type: string
 *                 enum: [online, offline, hybrid]
 *               cover_image:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Event updated successfully
 *       404:
 *         description: Event not found
 */
router.put('/:id', uploadImage('event').single('cover_image'), eventController.updateEvent);

/**
 * @swagger
 * /api/v1/event/{id}:
 *   delete:
 *     summary: Soft delete an event
 *     tags: [Events]
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
 *         description: Event deleted successfully (soft delete)
 *       404:
 *         description: Event not found
 */
router.delete('/:id', eventController.deleteEvent);

export default router;
