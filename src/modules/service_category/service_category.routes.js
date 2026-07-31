import express from 'express';
import * as serviceCategoryController from './service_category.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ServiceCategories
 *   description: Service Category management APIs
 */

/**
 * @swagger
 * /api/v1/service-category:
 *   post:
 *     summary: Create a new service category
 *     tags: [ServiceCategories]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - serviceCategoryName
 *             properties:
 *               serviceCategoryName:
 *                 type: string
 *               serviceCategoryImage:
 *                 type: string
 *                 format: binary
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Service category created successfully
 */
router.post('/', uploadImage('service_category').single('serviceCategoryImage'), serviceCategoryController.createCategory);

/**
 * @swagger
 * /api/v1/service-category:
 *   get:
 *     summary: Get all active service categories
 *     tags: [ServiceCategories]
 *     responses:
 *       200:
 *         description: A list of service categories
 */
router.get('/', serviceCategoryController.getAllCategories);

/**
 * @swagger
 * /api/v1/service-category/bulk-delete:
 *   post:
 *     summary: Bulk soft delete service categories
 *     tags: [ServiceCategories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - serviceCategoryIds
 *             properties:
 *               serviceCategoryIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               deletedRemarks:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Service categories deleted successfully (bulk soft delete)
 *       400:
 *         description: Bad Request (missing or invalid array of IDs)
 */
router.post('/bulk-delete', serviceCategoryController.bulkDeleteCategories);

/**
 * @swagger
 * /api/v1/service-category/{id}:
 *   get:
 *     summary: Get a service category by ID
 *     tags: [ServiceCategories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Service category data
 *       404:
 *         description: Service category not found
 */
router.get('/:id', serviceCategoryController.getCategoryById);

/**
 * @swagger
 * /api/v1/service-category/{id}:
 *   put:
 *     summary: Update a service category
 *     tags: [ServiceCategories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               serviceCategoryName:
 *                 type: string
 *               serviceCategoryImage:
 *                 type: string
 *                 format: binary
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Service category updated successfully
 *       404:
 *         description: Service category not found
 */
router.put('/:id', uploadImage('service_category').single('serviceCategoryImage'), serviceCategoryController.updateCategory);

/**
 * @swagger
 * /api/v1/service-category/{id}:
 *   delete:
 *     summary: Soft delete a service category
 *     tags: [ServiceCategories]
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
 *         description: Service category deleted successfully (soft delete)
 *       404:
 *         description: Service category not found
 */
router.delete('/:id', serviceCategoryController.deleteCategory);

export default router;
