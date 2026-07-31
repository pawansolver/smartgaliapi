import express from 'express';
import * as societyMemberController from './society_member.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SocietyMembers
 *   description: Society Member management APIs
 */

/**
 * @swagger
 * /api/v1/society-member:
 *   post:
 *     summary: Create a new society member
 *     tags: [SocietyMembers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               society_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               flat_no:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, member, tenant, committee]
 *               joined_at:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending, rejected]
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Society member created successfully
 */
router.post('/', societyMemberController.createMember);

/**
 * @swagger
 * /api/v1/society-member:
 *   get:
 *     summary: Get all active society members
 *     tags: [SocietyMembers]
 *     responses:
 *       200:
 *         description: A list of society members
 */
router.get('/', societyMemberController.getAllMembers);

/**
 * @swagger
 * /api/v1/society-member/bulk-delete:
 *   post:
 *     summary: Bulk soft delete society members
 *     tags: [SocietyMembers]
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
 *         description: Society members deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', societyMemberController.bulkDeleteMembers);

/**
 * @swagger
 * /api/v1/society-member/{id}:
 *   get:
 *     summary: Get a society member by ID
 *     tags: [SocietyMembers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Society member data
 *       404:
 *         description: Society member not found
 */
router.get('/:id', societyMemberController.getMemberById);

/**
 * @swagger
 * /api/v1/society-member/{id}:
 *   put:
 *     summary: Update a society member
 *     tags: [SocietyMembers]
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
 *               flat_no:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, member, tenant, committee]
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending, rejected]
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Society member updated successfully
 *       404:
 *         description: Society member not found
 */
router.put('/:id', societyMemberController.updateMember);

/**
 * @swagger
 * /api/v1/society-member/{id}:
 *   delete:
 *     summary: Soft delete a society member
 *     tags: [SocietyMembers]
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
 *         description: Society member deleted successfully (soft delete)
 *       404:
 *         description: Society member not found
 */
router.delete('/:id', societyMemberController.deleteMember);

export default router;
