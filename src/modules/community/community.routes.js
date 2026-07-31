import express from 'express';
import * as communityController from './community.controller.js';
import { uploadImage } from '../../utils/fileUpload.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Communities
 *   description: Community management APIs
 */

/**
 * @swagger
 * /api/v1/community:
 *   post:
 *     summary: Create a new community
 *     tags: [Communities]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - communityName
 *             properties:
 *               communityName:
 *                 type: string
 *               communityDescription:
 *                 type: string
 *               category_id:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *               cover_image:
 *                 type: string
 *                 format: binary
 *               is_private:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending]
 *     responses:
 *       201:
 *         description: Community created successfully
 */
router.post('/', uploadImage('community').single('cover_image'), communityController.createCommunity);

/**
 * @swagger
 * /api/v1/community:
 *   get:
 *     summary: Get all active communities
 *     tags: [Communities]
 *     responses:
 *       200:
 *         description: A list of communities
 */
router.get('/', communityController.getAllCommunities);

/**
 * @swagger
 * /api/v1/community/my:
 *   get:
 *     summary: Get my communities
 *     tags: [Communities]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A list of communities joined by the user
 */
router.get('/my', communityController.getMyCommunities);

/**
 * @swagger
 * /api/v1/community/suggested:
 *   get:
 *     summary: Get suggested communities
 *     tags: [Communities]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: A list of suggested communities
 */
router.get('/suggested', communityController.getSuggestedCommunities);

/**
 * @swagger
 * /api/v1/community/status/requests:
 *   get:
 *     summary: Get pending community requests
 *     tags: [Communities]
 *     responses:
 *       200:
 *         description: A list of pending communities
 */
router.get('/status/requests', communityController.getPendingCommunities);

/**
 * @swagger
 * /api/v1/community/{id}:
 *   get:
 *     summary: Get a community by ID
 *     tags: [Communities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Community data
 *       404:
 *         description: Community not found
 */
router.get('/:id', communityController.getCommunityById);

/**
 * @swagger
 * /api/v1/community/{id}:
 *   put:
 *     summary: Update a community
 *     tags: [Communities]
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
 *               communityName:
 *                 type: string
 *               communityDescription:
 *                 type: string
 *               category_id:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *               cover_image:
 *                 type: string
 *                 format: binary
 *               is_private:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [active, inactive, pending]
 *     responses:
 *       200:
 *         description: Community updated successfully
 *       404:
 *         description: Community not found
 */
router.put('/:id', uploadImage('community').single('cover_image'), communityController.updateCommunity);

/**
 * @swagger
 * /api/v1/community/{id}:
 *   delete:
 *     summary: Soft delete a community
 *     tags: [Communities]
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
 *         description: Community deleted successfully (soft delete)
 *       404:
 *         description: Community not found
 */
router.delete('/:id', communityController.deleteCommunity);

/**
 * @swagger
 * /api/v1/community/{id}/join:
 *   post:
 *     summary: Join a community
 *     tags: [Communities]
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
 *             required:
 *               - user_id
 *             properties:
 *               user_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Joined successfully
 */
router.post('/:id/join', communityController.joinCommunity);

/**
 * @swagger
 * /api/v1/community/{id}/leave:
 *   post:
 *     summary: Leave a community
 *     tags: [Communities]
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
 *             required:
 *               - user_id
 *             properties:
 *               user_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Left successfully
 */
router.post('/:id/leave', communityController.leaveCommunity);

/**
 * @swagger
 * /api/v1/community/{id}/members:
 *   get:
 *     summary: Get members of a community
 *     tags: [Communities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of members
 */
router.get('/:id/members', communityController.getCommunityMembers);

/**
 * @swagger
 * /api/v1/community/{id}/invite:
 *   post:
 *     summary: Invite a user to the community
 *     tags: [Communities]
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
 *             required:
 *               - inviter_id
 *               - invitee_id
 *             properties:
 *               inviter_id:
 *                 type: integer
 *               invitee_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Invitation sent successfully
 */
router.post('/:id/invite', communityController.inviteUser);

/**
 * @swagger
 * /api/v1/community/{id}/approve:
 *   put:
 *     summary: Approve a community
 *     tags: [Communities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Community approved successfully
 */
router.put('/:id/approve', communityController.approveCommunity);

/**
 * @swagger
 * /api/v1/community/{id}/reject:
 *   put:
 *     summary: Reject a community
 *     tags: [Communities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Community rejected successfully
 */
router.put('/:id/reject', communityController.rejectCommunity);

export default router;
