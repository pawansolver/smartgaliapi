import express from 'express';
import * as eventParticipantController from './event_participant.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: EventParticipants
 *   description: Event Participant management APIs
 */

/**
 * @swagger
 * /api/v1/event-participant:
 *   post:
 *     summary: Create a new event participant
 *     tags: [EventParticipants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               status:
 *                 type: string
 *                 enum: [going, interested, invited, declined]
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Event participant created successfully
 */
router.post('/', eventParticipantController.createParticipant);

/**
 * @swagger
 * /api/v1/event-participant:
 *   get:
 *     summary: Get all active event participants
 *     tags: [EventParticipants]
 *     responses:
 *       200:
 *         description: A list of event participants
 */
router.get('/', eventParticipantController.getAllParticipants);

/**
 * @swagger
 * /api/v1/event-participant/bulk-delete:
 *   post:
 *     summary: Bulk soft delete event participants
 *     tags: [EventParticipants]
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
 *         description: Event participants deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', eventParticipantController.bulkDeleteParticipants);

/**
 * @swagger
 * /api/v1/event-participant/{id}:
 *   get:
 *     summary: Get an event participant by ID
 *     tags: [EventParticipants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Event participant data
 *       404:
 *         description: Event participant not found
 */
router.get('/:id', eventParticipantController.getParticipantById);

/**
 * @swagger
 * /api/v1/event-participant/{id}:
 *   put:
 *     summary: Update an event participant
 *     tags: [EventParticipants]
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
 *               status:
 *                 type: string
 *                 enum: [going, interested, invited, declined]
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Event participant updated successfully
 *       404:
 *         description: Event participant not found
 */
router.put('/:id', eventParticipantController.updateParticipant);

/**
 * @swagger
 * /api/v1/event-participant/{id}:
 *   delete:
 *     summary: Soft delete an event participant
 *     tags: [EventParticipants]
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
 *         description: Event participant deleted successfully (soft delete)
 *       404:
 *         description: Event participant not found
 */
router.delete('/:id', eventParticipantController.deleteParticipant);

export default router;
