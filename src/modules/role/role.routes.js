import express from 'express';
import * as roleController from './role.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Roles
 *   description: Role management APIs
 */

/**
 * @swagger
 * /api/v1/role:
 *   post:
 *     summary: Create a new role
 *     tags: [Roles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roleName
 *             properties:
 *               roleName:
 *                 type: string
 *               roleDescription:
 *                 type: string
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Role created successfully
 */
router.post('/', roleController.createRole);

/**
 * @swagger
 * /api/v1/role:
 *   get:
 *     summary: Get all active roles
 *     tags: [Roles]
 *     responses:
 *       200:
 *         description: A list of roles
 */
router.get('/', roleController.getAllRoles);

/**
 * @swagger
 * /api/v1/role/{id}:
 *   get:
 *     summary: Get a role by ID
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Role data
 *       404:
 *         description: Role not found
 */
router.get('/:id', roleController.getRoleById);

/**
 * @swagger
 * /api/v1/role/{id}:
 *   put:
 *     summary: Update a role
 *     tags: [Roles]
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
 *               roleName:
 *                 type: string
 *               roleDescription:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Role updated successfully
 *       404:
 *         description: Role not found
 */
router.put('/:id', roleController.updateRole);

/**
 * @swagger
 * /api/v1/role/{id}:
 *   delete:
 *     summary: Soft delete a role
 *     tags: [Roles]
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
 *         description: Role deleted successfully (soft delete)
 *       404:
 *         description: Role not found
 */
router.delete('/:id', roleController.deleteRole);

export default router;
