import express from 'express';
import * as chatParticipantController from './chat_participant.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  bindAuthenticatedIdentity,
  requireAppAdmin,
  requireChatAdmin,
  verifyChatMember,
} from '../../middleware/chatAuthorization.middleware.js';

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: ChatParticipants
 *   description: Chat Participant management APIs
 */

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/chat-participant/{chatId}/members:
 *   get:
 *     summary: Get all members of a chat (with online status)
 *     description: Returns all active participants of a chat, including user profile, is_online, last_seen, and role. Admins are listed first.
 *     tags: [ChatParticipants]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of chat members with online presence data
 */
router.get('/:chatId/members', verifyChatMember, chatParticipantController.getChatMembers);

/**
 * @swagger
 * /api/v1/chat-participant/{chatId}/add:
 *   post:
 *     summary: Add participants to a group chat
 *     description: Bulk-adds users to a group chat inside a database transaction. Skips users who are already members.
 *     tags: [ChatParticipants]
 *     parameters:
 *       - in: path
 *         name: chatId
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
 *               - userIds
 *               - addedBy
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               addedBy:
 *                 type: integer
 *                 description: ID of the admin adding these users
 *     responses:
 *       201:
 *         description: Participants added successfully
 *       400:
 *         description: All users are already participants
 */
router.post('/:chatId/add',
  bindAuthenticatedIdentity('addedBy'),
  verifyChatMember,
  requireChatAdmin,
  chatParticipantController.addParticipants
);

/**
 * @swagger
 * /api/v1/chat-participant/{chatId}/remove/{userId}:
 *   delete:
 *     summary: Remove a member from a chat
 *     description: Soft-deletes the ChatParticipant record. Only admins should call this (authorization enforced at app level).
 *     tags: [ChatParticipants]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
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
 *               - removedBy
 *             properties:
 *               removedBy:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Member removed from chat
 *       404:
 *         description: Participant not found
 */
router.delete('/:chatId/remove/:userId',
  bindAuthenticatedIdentity('removedBy'),
  verifyChatMember,
  requireChatAdmin,
  chatParticipantController.removeMember
);

/**
 * @swagger
 * /api/v1/chat-participant/{chatId}/make-admin/{userId}:
 *   put:
 *     summary: Promote a member to admin
 *     tags: [ChatParticipants]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
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
 *               - promotedBy
 *             properties:
 *               promotedBy:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Member promoted to admin
 */
router.put('/:chatId/make-admin/:userId',
  bindAuthenticatedIdentity('promotedBy'),
  verifyChatMember,
  requireChatAdmin,
  chatParticipantController.makeAdmin
);

/**
 * @swagger
 * /api/v1/chat-participant/{chatId}/leave:
 *   post:
 *     summary: Leave a chat
 *     description: User removes themselves from the chat. If the leaving user was the only admin, the oldest remaining member is auto-promoted.
 *     tags: [ChatParticipants]
 *     parameters:
 *       - in: path
 *         name: chatId
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
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: You have left the chat
 */
router.post('/:chatId/leave',
  bindAuthenticatedIdentity('userId'),
  verifyChatMember,
  chatParticipantController.leaveChat
);

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/chat-participant:
 *   post:
 *     summary: Create a chat participant (legacy)
 *     tags: [ChatParticipants]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chat_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               role:
 *                 type: string
 *                 enum: [admin, member]
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Chat participant created successfully
 */
router.post('/', requireAppAdmin, chatParticipantController.createParticipant);

/**
 * @swagger
 * /api/v1/chat-participant:
 *   get:
 *     summary: Get all active chat participants (admin)
 *     tags: [ChatParticipants]
 *     responses:
 *       200:
 *         description: A list of chat participants
 */
router.get('/', requireAppAdmin, chatParticipantController.getAllParticipants);

/**
 * @swagger
 * /api/v1/chat-participant/bulk-delete:
 *   post:
 *     summary: Bulk soft delete chat participants
 *     tags: [ChatParticipants]
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
 *         description: Chat participants deleted successfully
 */
router.post('/bulk-delete', requireAppAdmin, chatParticipantController.bulkDeleteParticipants);

/**
 * @swagger
 * /api/v1/chat-participant/{id}:
 *   get:
 *     summary: Get a chat participant by ID
 *     tags: [ChatParticipants]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chat participant data
 *       404:
 *         description: Chat participant not found
 */
router.get('/:id', requireAppAdmin, chatParticipantController.getParticipantById);

/**
 * @swagger
 * /api/v1/chat-participant/{id}:
 *   put:
 *     summary: Update a chat participant (legacy)
 *     tags: [ChatParticipants]
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
 *                 enum: [admin, member]
 *               nickname:
 *                 type: string
 *               is_pinned:
 *                 type: boolean
 *               is_muted:
 *                 type: boolean
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Chat participant updated
 */
router.put('/:id', requireAppAdmin, chatParticipantController.updateParticipant);

/**
 * @swagger
 * /api/v1/chat-participant/{id}:
 *   delete:
 *     summary: Soft delete a chat participant (legacy)
 *     tags: [ChatParticipants]
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
 *         description: Chat participant deleted
 */
router.delete('/:id', requireAppAdmin, chatParticipantController.deleteParticipant);

export default router;
