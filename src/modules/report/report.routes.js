import express from 'express';
import * as reportController from './report.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Reports
 *   description: Report management APIs
 */

/**
 * @swagger
 * /api/v1/report:
 *   post:
 *     summary: Create a new report
 *     tags: [Reports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reported_type
 *               - reported_id
 *               - reason
 *             properties:
 *               reporter_id:
 *                 type: integer
 *               reported_type:
 *                 type: string
 *                 enum: [user, post, comment, event, business]
 *               reported_id:
 *                 type: integer
 *               reason:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [pending, reviewed, resolved, dismissed]
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Report created successfully
 */
router.post('/', reportController.createReport);

/**
 * @swagger
 * /api/v1/report:
 *   get:
 *     summary: Get all active reports
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: A list of reports
 */
router.get('/', reportController.getAllReports);

/**
 * @swagger
 * /api/v1/report/bulk-delete:
 *   post:
 *     summary: Bulk soft delete reports
 *     tags: [Reports]
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
 *         description: Reports deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', reportController.bulkDeleteReports);

/**
 * @swagger
 * /api/v1/report/{id}:
 *   get:
 *     summary: Get a report by ID
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Report data
 *       404:
 *         description: Report not found
 */
router.get('/:id', reportController.getReportById);

/**
 * @swagger
 * /api/v1/report/{id}:
 *   put:
 *     summary: Update a report
 *     tags: [Reports]
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
 *                 enum: [pending, reviewed, resolved, dismissed]
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Report updated successfully
 *       404:
 *         description: Report not found
 */
router.put('/:id', reportController.updateReport);

/**
 * @swagger
 * /api/v1/report/{id}:
 *   delete:
 *     summary: Soft delete a report
 *     tags: [Reports]
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
 *         description: Report deleted successfully (soft delete)
 *       404:
 *         description: Report not found
 */
router.delete('/:id', reportController.deleteReport);

export default router;
