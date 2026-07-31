import express from 'express';
import * as mediaFileController from './media_file.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: MediaFiles
 *   description: Media File management APIs
 */

/**
 * @swagger
 * /api/v1/media-file:
 *   post:
 *     summary: Create a new media file record
 *     tags: [MediaFiles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [image, video, document, audio, other]
 *               uploaded_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Media file created successfully
 */
router.post('/', mediaFileController.createFile);

/**
 * @swagger
 * /api/v1/media-file:
 *   get:
 *     summary: Get all active media files
 *     tags: [MediaFiles]
 *     responses:
 *       200:
 *         description: A list of media files
 */
router.get('/', mediaFileController.getAllFiles);

/**
 * @swagger
 * /api/v1/media-file/bulk-delete:
 *   post:
 *     summary: Bulk soft delete media files
 *     tags: [MediaFiles]
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
 *         description: Media files deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', mediaFileController.bulkDeleteFiles);

/**
 * @swagger
 * /api/v1/media-file/{id}:
 *   get:
 *     summary: Get a media file by ID
 *     tags: [MediaFiles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Media file data
 *       404:
 *         description: Media file not found
 */
router.get('/:id', mediaFileController.getFileById);

/**
 * @swagger
 * /api/v1/media-file/{id}:
 *   put:
 *     summary: Update a media file
 *     tags: [MediaFiles]
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
 *               url:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [image, video, document, audio, other]
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Media file updated successfully
 *       404:
 *         description: Media file not found
 */
router.put('/:id', mediaFileController.updateFile);

/**
 * @swagger
 * /api/v1/media-file/{id}:
 *   delete:
 *     summary: Soft delete a media file
 *     tags: [MediaFiles]
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
 *         description: Media file deleted successfully (soft delete)
 *       404:
 *         description: Media file not found
 */
router.delete('/:id', mediaFileController.deleteFile);

export default router;
