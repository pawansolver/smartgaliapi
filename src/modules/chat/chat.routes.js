import express from 'express';
import * as chatController from './chat.controller.js';
import { uploadLimiter } from '../../middleware/rateLimit.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  bindAuthenticatedIdentity,
  requireAppAdmin,
  requireChatAdmin,
  verifyChatMember,
} from '../../middleware/chatAuthorization.middleware.js';
import { chatAttachmentUpload, validateChatAttachment } from '../../utils/chatAttachmentUpload.js';

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Chats
 *   description: Chat management APIs
 */

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/chat/my-chats:
 *   get:
 *     summary: Get current user's chat list
 *     description: Returns all chats for a user sorted by last_message_at DESC, with unread count, last message preview, and online status of the other participant (for one_to_one chats).
 *     tags: [Chats]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the requesting user
 *     responses:
 *       200:
 *         description: Chat list with last message, unread count, and online status
 *       400:
 *         description: userId is required
 */
router.get('/my-chats', bindAuthenticatedIdentity('userId'), chatController.getMyChats);

/**
 * @swagger
 * /api/v1/chat/one-to-one:
 *   post:
 *     summary: Get or create a one-to-one chat
 *     description: Idempotent — returns existing direct chat between two users, or creates one. Safe to call multiple times.
 *     tags: [Chats]
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
 *                 description: Requesting user's ID
 *               targetUserId:
 *                 type: integer
 *                 description: The other user's ID (use exactly one recipient field)
 *               phoneNumber:
 *                 type: string
 *                 description: The other user's phone number (alternative to targetUserId)
 *               created_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Existing chat returned
 *       201:
 *         description: New chat created
 */
router.post('/one-to-one', bindAuthenticatedIdentity('userId', 'created_by'), chatController.getOrCreateOneToOneChat);

/**
 * @swagger
 * /api/v1/chat/group:
 *   post:
 *     summary: Create a group chat
 *     description: Creates a new group chat and auto-adds creator as admin.
 *     tags: [Chats]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - created_by
 *               - participantIds
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 120
 *               description:
 *                 type: string
 *               avatar_url:
 *                 type: string
 *               participantIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Group chat created successfully
 */
router.post('/group', bindAuthenticatedIdentity('created_by'), chatController.createGroupChat);

/**
 * @swagger
 * /api/v1/chat/upload-attachment:
 *   post:
 *     summary: Upload a chat attachment (image / video / audio / document)
 *     description: >
 *       Step 1 of 2 for media messages. Upload the file here first to receive
 *       media_url and media_metadata, then pass them to POST /api/v1/message/send.
 *       Max size 50 MB.
 *     tags: [Chats]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               attachment:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Returns media_url, media_metadata, and message_type
 *       400:
 *         description: No file uploaded or unsupported file type
 */
router.post('/upload-attachment',
  uploadLimiter,
  chatAttachmentUpload.single('attachment'),
  validateChatAttachment,
  chatController.uploadAttachment
);

/**
 * @swagger
 * /api/v1/chat/{chatId}/mute:
 *   put:
 *     summary: Mute or unmute a chat for a user
 *     tags: [Chats]
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
 *               - is_muted
 *             properties:
 *               userId:
 *                 type: integer
 *               is_muted:
 *                 type: boolean
 *               muted_until:
 *                 type: string
 *                 format: date-time
 *                 description: Optional mute expiry (null = forever)
 *     responses:
 *       200:
 *         description: Chat muted/unmuted successfully
 */
router.put('/:chatId/mute', bindAuthenticatedIdentity('userId'), verifyChatMember, chatController.muteChat);

/**
 * @swagger
 * /api/v1/chat/{chatId}/pin:
 *   put:
 *     summary: Pin or unpin a chat (per user)
 *     tags: [Chats]
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
 *               - is_pinned
 *             properties:
 *               userId:
 *                 type: integer
 *               is_pinned:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Chat pinned/unpinned successfully
 */
router.put('/:chatId/pin', bindAuthenticatedIdentity('userId'), verifyChatMember, chatController.pinChat);

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY CRUD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/chat:
 *   post:
 *     summary: Create a new chat (generic/legacy)
 *     tags: [Chats]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chat_type:
 *                 type: string
 *                 enum: [one_to_one, group, community, event, business]
 *               name:
 *                 type: string
 *               community_id:
 *                 type: integer
 *               event_id:
 *                 type: integer
 *               business_id:
 *                 type: integer
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Chat created successfully
 */
router.post('/', requireAppAdmin, bindAuthenticatedIdentity('created_by'), chatController.createChat);

/**
 * @swagger
 * /api/v1/chat:
 *   get:
 *     summary: Get all active chats (admin)
 *     tags: [Chats]
 *     responses:
 *       200:
 *         description: A list of chats
 */
router.get('/', requireAppAdmin, chatController.getAllChats);

/**
 * @swagger
 * /api/v1/chat/bulk-delete:
 *   post:
 *     summary: Bulk soft delete chats
 *     tags: [Chats]
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
 *         description: Chats deleted successfully
 */
router.post('/bulk-delete', requireAppAdmin, chatController.bulkDeleteChats);

/**
 * @swagger
 * /api/v1/chat/{id}:
 *   get:
 *     summary: Get a chat by ID
 *     tags: [Chats]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Chat data
 *       404:
 *         description: Chat not found
 */
router.get('/:id', verifyChatMember, chatController.getChatById);

/**
 * @swagger
 * /api/v1/chat/{id}:
 *   put:
 *     summary: Update a chat
 *     tags: [Chats]
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
 *               avatar_url:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Chat updated successfully
 */
router.put('/:id', verifyChatMember, requireChatAdmin, chatController.updateChat);

/**
 * @swagger
 * /api/v1/chat/{id}:
 *   delete:
 *     summary: Soft delete a chat
 *     tags: [Chats]
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
 *         description: Chat deleted successfully
 */
router.delete('/:id', verifyChatMember, requireChatAdmin, chatController.deleteChat);

export default router;
