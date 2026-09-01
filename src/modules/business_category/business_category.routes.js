import express from 'express';
import * as businessCategoryController from './business_category.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: BusinessCategories
 *   description: Business Category management APIs
 */

/**
 * @swagger
 * /api/v1/business-category:
 *   post:
 *     summary: Create a new business category
 *     tags: [BusinessCategories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               icon:
 *                 type: string
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Business category created successfully
 */
router.post('/', uploadImage('category').single('icon'), businessCategoryController.createCategory);

/**
 * @swagger
 * /api/v1/business-category:
 *   get:
 *     summary: Get all active business categories
 *     tags: [BusinessCategories]
 *     responses:
 *       200:
 *         description: A list of business categories
 */
router.get('/', businessCategoryController.getAllCategories);

/**
 * @swagger
 * /api/v1/business-category/{id}:
 *   get:
 *     summary: Get a business category by ID
 *     tags: [BusinessCategories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Business category data
 *       404:
 *         description: Business category not found
 */
router.get('/:id', businessCategoryController.getCategoryById);

/**
 * @swagger
 * /api/v1/business-category/{id}:
 *   put:
 *     summary: Update a business category
 *     tags: [BusinessCategories]
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
 *               name:
 *                 type: string
 *               icon:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Business category updated successfully
 *       404:
 *         description: Business category not found
 */
router.put('/:id', uploadImage('category').single('icon'), businessCategoryController.updateCategory);

/**
 * @swagger
 * /api/v1/business-category/{id}:
 *   delete:
 *     summary: Soft delete a business category
 *     tags: [BusinessCategories]
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
 *         description: Business category deleted successfully (soft delete)
 *       404:
 *         description: Business category not found
 */
router.delete('/:id', businessCategoryController.deleteCategory);

export default router;
