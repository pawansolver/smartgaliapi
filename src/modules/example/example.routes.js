import express from 'express';
import * as exampleController from './example.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Example
 *   description: Simple Example APIs to check status
 */

/**
 * @swagger
 * /api/v1/example/status:
 *   get:
 *     summary: Check API Status
 *     tags: [Example]
 *     responses:
 *       200:
 *         description: API is running properly
 */
router.get('/status', exampleController.checkStatus);

export default router;
