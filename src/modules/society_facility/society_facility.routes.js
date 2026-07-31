import express from 'express';
import * as societyFacilityController from './society_facility.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SocietyFacilities
 *   description: Society Facility management APIs
 */

/**
 * @swagger
 * /api/v1/society-facility:
 *   post:
 *     summary: Create a new society facility
 *     tags: [SocietyFacilities]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               society_id:
 *                 type: integer
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Society facility created successfully
 */
router.post('/', societyFacilityController.createFacility);

/**
 * @swagger
 * /api/v1/society-facility:
 *   get:
 *     summary: Get all active society facilities
 *     tags: [SocietyFacilities]
 *     responses:
 *       200:
 *         description: A list of society facilities
 */
router.get('/', societyFacilityController.getAllFacilities);

/**
 * @swagger
 * /api/v1/society-facility/bulk-delete:
 *   post:
 *     summary: Bulk soft delete society facilities
 *     tags: [SocietyFacilities]
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
 *         description: Society facilities deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', societyFacilityController.bulkDeleteFacilities);

/**
 * @swagger
 * /api/v1/society-facility/{id}:
 *   get:
 *     summary: Get a society facility by ID
 *     tags: [SocietyFacilities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Society facility data
 *       404:
 *         description: Society facility not found
 */
router.get('/:id', societyFacilityController.getFacilityById);

/**
 * @swagger
 * /api/v1/society-facility/{id}:
 *   put:
 *     summary: Update a society facility
 *     tags: [SocietyFacilities]
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
 *               description:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Society facility updated successfully
 *       404:
 *         description: Society facility not found
 */
router.put('/:id', societyFacilityController.updateFacility);

/**
 * @swagger
 * /api/v1/society-facility/{id}:
 *   delete:
 *     summary: Soft delete a society facility
 *     tags: [SocietyFacilities]
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
 *         description: Society facility deleted successfully (soft delete)
 *       404:
 *         description: Society facility not found
 */
router.delete('/:id', societyFacilityController.deleteFacility);

export default router;
