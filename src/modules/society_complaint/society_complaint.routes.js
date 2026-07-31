import express from 'express';
import * as societyComplaintController from './society_complaint.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SocietyComplaints
 *   description: Society Complaint management APIs
 */

/**
 * @swagger
 * /api/v1/society-complaint:
 *   post:
 *     summary: Create a new society complaint
 *     tags: [SocietyComplaints]
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
 *               user_id:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [open, in_progress, resolved, closed]
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Society complaint created successfully
 */
router.post('/', societyComplaintController.createComplaint);

/**
 * @swagger
 * /api/v1/society-complaint:
 *   get:
 *     summary: Get all active society complaints
 *     tags: [SocietyComplaints]
 *     responses:
 *       200:
 *         description: A list of society complaints
 */
router.get('/', societyComplaintController.getAllComplaints);

/**
 * @swagger
 * /api/v1/society-complaint/bulk-delete:
 *   post:
 *     summary: Bulk soft delete society complaints
 *     tags: [SocietyComplaints]
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
 *         description: Society complaints deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', societyComplaintController.bulkDeleteComplaints);

/**
 * @swagger
 * /api/v1/society-complaint/{id}:
 *   get:
 *     summary: Get a society complaint by ID
 *     tags: [SocietyComplaints]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Society complaint data
 *       404:
 *         description: Society complaint not found
 */
router.get('/:id', societyComplaintController.getComplaintById);

/**
 * @swagger
 * /api/v1/society-complaint/{id}:
 *   put:
 *     summary: Update a society complaint
 *     tags: [SocietyComplaints]
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
 *               status:
 *                 type: string
 *                 enum: [open, in_progress, resolved, closed]
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Society complaint updated successfully
 *       404:
 *         description: Society complaint not found
 */
router.put('/:id', societyComplaintController.updateComplaint);

/**
 * @swagger
 * /api/v1/society-complaint/{id}:
 *   delete:
 *     summary: Soft delete a society complaint
 *     tags: [SocietyComplaints]
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
 *         description: Society complaint deleted successfully (soft delete)
 *       404:
 *         description: Society complaint not found
 */
router.delete('/:id', societyComplaintController.deleteComplaint);

export default router;
