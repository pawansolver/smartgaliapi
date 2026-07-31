import express from 'express';
import * as communityMemberController from './communityMember.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: CommunityMembers
 *   description: Community Member management APIs
 */

/**
 * @swagger
 * /api/v1/community-member:
 *   post:
 *     summary: Add a new community member
 *     tags: [CommunityMembers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - community_id
 *               - user_id
 *             properties:
 *               community_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               role:
 *                 type: string
 *                 enum: [admin, moderator, member]
 *               status:
 *                 type: string
 *                 enum: [active, banned, left, pending]
 *     responses:
 *       201:
 *         description: Community Member added successfully
 */
router.post('/', communityMemberController.createCommunityMember);

/**
 * @swagger
 * /api/v1/community-member:
 *   get:
 *     summary: Get all active community members
 *     tags: [CommunityMembers]
 *     responses:
 *       200:
 *         description: A list of community members
 */
router.get('/', communityMemberController.getAllCommunityMembers);

/**
 * @swagger
 * /api/v1/community-member/{id}:
 *   get:
 *     summary: Get a community member by ID
 *     tags: [CommunityMembers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Community Member data
 *       404:
 *         description: Community Member not found
 */
router.get('/:id', communityMemberController.getCommunityMemberById);

/**
 * @swagger
 * /api/v1/community-member/{id}:
 *   put:
 *     summary: Update a community member
 *     tags: [CommunityMembers]
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
 *               role:
 *                 type: string
 *                 enum: [admin, moderator, member]
 *               status:
 *                 type: string
 *                 enum: [active, banned, left, pending]
 *     responses:
 *       200:
 *         description: Community Member updated successfully
 *       404:
 *         description: Community Member not found
 */
router.put('/:id', communityMemberController.updateCommunityMember);

/**
 * @swagger
 * /api/v1/community-member/{id}:
 *   delete:
 *     summary: Soft delete a community member
 *     tags: [CommunityMembers]
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
 *                 type: string
 *     responses:
 *       200:
 *         description: Community Member deleted successfully (soft delete)
 *       404:
 *         description: Community Member not found
 */
router.delete('/:id', communityMemberController.deleteCommunityMember);

export default router;
