import express from 'express';
import * as messageController from './message.controller.js';
import {
  messageActionLimiter,
  messageSendLimiter,
  readLimiter,
  reactionLimiter,
} from '../../middleware/rateLimit.middleware.js';
import { sanitizeBody, validateMessagePayload } from '../../middleware/sanitize.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  bindAuthenticatedIdentity,
  requireAppAdmin,
  requireMessageOwnerOrChatAdmin,
  verifyChatMember,
  verifyMessageMember,
  verifyTargetChatMember,
} from '../../middleware/chatAuthorization.middleware.js';

const router = express.Router();
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Messages
 *   description: Message management APIs
 */

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/message/send:
 *   post:
 *     summary: Send a message (ACID transaction + Idempotency)
 *     description: >
 *       **Idempotent:** Pass `idempotency_key` (client-generated UUID) to
 *       safely retry on network failure. Server returns HTTP 200 with the
 *       original message if the key was already processed.
 *
 *       **Atomic:** Inserts message + updates Chat.last_message + increments
 *       unread counts + creates per-user MessageReceipts in one transaction.
 *
 *       For media, first upload via POST /api/v1/chat/upload-attachment then
 *       pass media_url + media_metadata here.
 *     tags: [Messages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chat_id
 *               - sender_id
 *             properties:
 *               chat_id:
 *                 type: integer
 *               sender_id:
 *                 type: integer
 *               idempotency_key:
 *                 type: string
 *                 description: Client UUID to prevent duplicates on retry (recommended)
 *               message:
 *                 type: string
 *               message_type:
 *                 type: string
 *                 enum: [text, image, video, audio, document, location, contact, sticker, gif]
 *                 default: text
 *               media_url:
 *                 type: string
 *               media_metadata:
 *                 type: object
 *               reply_to:
 *                 type: integer
 *               is_forwarded:
 *                 type: boolean
 *               location_lat:
 *                 type: number
 *               location_lng:
 *                 type: number
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       200:
 *         description: Idempotent response — message was already sent with this key
 *       429:
 *         description: Rate limit exceeded (max 60 per minute)
 */
router.post('/send',
  messageSendLimiter,
  bindAuthenticatedIdentity('sender_id', 'created_by'),
  verifyChatMember,
  sanitizeBody,
  validateMessagePayload,
  messageController.sendMessage
);

/**
 * @swagger
 * /api/v1/message/mark-all-read:
 *   post:
 *     summary: Mark all messages in a chat as read (reset unread badge)
 *     tags: [Messages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chatId
 *               - userId
 *             properties:
 *               chatId:
 *                 type: integer
 *               userId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: All messages marked as read
 */
router.post('/mark-all-read', bindAuthenticatedIdentity('userId'), verifyChatMember, messageController.markAllRead);

/**
 * @swagger
 * /api/v1/message/chat/{chatId}:
 *   get:
 *     summary: Get messages in a chat (cursor-based pagination)
 *     description: >
 *       Returns messages oldest-first for UI rendering.
 *       Pass `nextCursor` from the previous response as `cursor` to load older messages.
 *       Messages deleted-for-me are automatically filtered out.
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Message ID to paginate from (omit for first load)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: "{ messages, nextCursor, hasMore }"
 */
router.get('/chat/:chatId', readLimiter, bindAuthenticatedIdentity('userId'), verifyChatMember, messageController.getChatMessages);

/**
 * @swagger
 * /api/v1/message/chat/{chatId}/search:
 *   get:
 *     summary: Search messages in a chat
 *     description: >
 *       Search abstraction layer — currently backed by SQL LIKE.
 *       The controller contract is fixed; internals can be swapped to
 *       Elasticsearch/OpenSearch without API changes.
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [text, image, video, audio, document]
 *     responses:
 *       200:
 *         description: "{ hits, total, engine }"
 */
router.get('/chat/:chatId/search', readLimiter, verifyChatMember, messageController.searchMessages);

/**
 * @swagger
 * /api/v1/message/chat/{chatId}/media:
 *   get:
 *     summary: Get media files in a chat (gallery view)
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [image, video, audio, document]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of media messages
 */
router.get('/chat/:chatId/media', readLimiter, verifyChatMember, messageController.getChatMedia);

router.get(
  '/chat/:chatId/pinned',
  readLimiter,
  bindAuthenticatedIdentity('userId'),
  verifyChatMember,
  messageController.getPinnedMessages
);

/**
 * @swagger
 * /api/v1/message/{id}/read:
 *   put:
 *     summary: Mark a single message as read (updates MessageReceipts table)
 *     tags: [Messages]
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
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Message marked as read
 */
router.put('/:id/read', bindAuthenticatedIdentity('userId'), verifyMessageMember, messageController.markMessageRead);

/**
 * @swagger
 * /api/v1/message/{id}/receipts:
 *   get:
 *     summary: Get delivery and read receipt summary for a message (WhatsApp-style info screen)
 *     description: Returns total recipients, delivered count, read count, and individual per-user receipt rows.
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: "{ total, delivered, read, pending, receipts }"
 */
router.get('/:id/receipts', readLimiter, verifyMessageMember, messageController.getReceiptSummary);

/**
 * @swagger
 * /api/v1/message/{id}/react:
 *   put:
 *     summary: Add or remove a reaction (relational table, atomic toggle)
 *     description: >
 *       Reactions stored in message_reactions table (not JSON).
 *       Toggle behavior — adds if not present, removes if already reacted.
 *       Returns updated summary { "emoji": { count, userIds } }.
 *     tags: [Messages]
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
 *               - userId
 *               - emoji
 *             properties:
 *               userId:
 *                 type: integer
 *               emoji:
 *                 type: string
 *                 example: "thumbsup"
 *     responses:
 *       200:
 *         description: "{ action, emoji, userId, summary }"
 *       429:
 *         description: Rate limit exceeded (max 120 per minute)
 */
router.put('/:id/react', reactionLimiter, bindAuthenticatedIdentity('userId'), verifyMessageMember, messageController.reactToMessage);

/**
 * @swagger
 * /api/v1/message/{id}/edit:
 *   put:
 *     summary: Edit a sent message (sender only, text messages only)
 *     description: Sets is_edited=true, edited_at=now, writes audit log.
 *     tags: [Messages]
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
 *               - userId
 *               - message
 *             properties:
 *               userId:
 *                 type: integer
 *               message:
 *                 type: string
 *                 maxLength: 10000
 *     responses:
 *       200:
 *         description: Message edited (is_edited=true)
 *       403:
 *         description: You can only edit your own messages
 */
router.put(
  '/:id/edit',
  messageActionLimiter,
  bindAuthenticatedIdentity('userId'),
  verifyMessageMember,
  sanitizeBody,
  messageController.editMessage
);

router.put(
  '/:id/pin',
  messageActionLimiter,
  bindAuthenticatedIdentity('userId'),
  verifyMessageMember,
  sanitizeBody,
  messageController.setMessagePin
);

/**
 * @swagger
 * /api/v1/message/{id}/delete-for-me:
 *   delete:
 *     summary: Delete a message for the requesting user only
 *     description: >
 *       Inserts a row into message_deletions table (relational, not JSON).
 *       Message remains visible to all other participants.
 *       Writes audit log.
 *     tags: [Messages]
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
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Message deleted for you
 */
router.delete(
  '/:id/delete-for-me',
  messageActionLimiter,
  bindAuthenticatedIdentity('userId'),
  verifyMessageMember,
  messageController.deleteForMe
);

/**
 * DELETE /api/v1/message/:id/delete-for-everyone
 * Sender-only. Allowed within MSG_DELETE_WINDOW_MS (default 24 h).
 * Tombstones message for ALL participants and emits message:deleted socket event.
 */
router.delete(
  '/:id/delete-for-everyone',
  messageActionLimiter,
  bindAuthenticatedIdentity('userId'),
  verifyMessageMember,
  messageController.deleteForEveryone
);

/**
 * @swagger
 * /api/v1/message/{id}/forward:
 *   post:
 *     summary: Forward a message to another chat
 *     description: Creates a copy in targetChatId with is_forwarded=true. Uses sendMessage internally (ACID). Writes audit log.
 *     tags: [Messages]
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
 *               - targetChatId
 *               - senderId
 *             properties:
 *               targetChatId:
 *                 type: integer
 *               senderId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Message forwarded successfully
 */
router.post('/:id/forward',
  messageActionLimiter,
  bindAuthenticatedIdentity('senderId', 'created_by'),
  verifyMessageMember,
  verifyTargetChatMember(),
  messageController.forwardMessage
);

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY CRUD (backward compatible)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/message:
 *   post:
 *     summary: Create a message (legacy — prefer /send)
 *     tags: [Messages]
 *     responses:
 *       201:
 *         description: Message created
 */
router.post('/',
  messageSendLimiter,
  bindAuthenticatedIdentity('sender_id', 'created_by'),
  verifyChatMember,
  sanitizeBody,
  messageController.createMessage
);

/**
 * @swagger
 * /api/v1/message:
 *   get:
 *     summary: Get all messages (admin)
 *     tags: [Messages]
 *     responses:
 *       200:
 *         description: List of all messages
 */
router.get('/', readLimiter, requireAppAdmin, messageController.getAllMessages);

/**
 * @swagger
 * /api/v1/message/bulk-delete:
 *   post:
 *     summary: Bulk soft delete messages
 *     tags: [Messages]
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
 *     responses:
 *       200:
 *         description: Messages bulk deleted
 */
router.post('/bulk-delete', requireAppAdmin, messageController.bulkDeleteMessages);

/**
 * @swagger
 * /api/v1/message/{id}:
 *   get:
 *     summary: Get a message by ID
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Message data
 *       404:
 *         description: Message not found
 */
router.get('/:id', verifyMessageMember, messageController.getMessageById);

/**
 * @swagger
 * /api/v1/message/{id}:
 *   put:
 *     summary: Update a message (legacy)
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Message updated
 */
router.put('/:id', verifyMessageMember, requireMessageOwnerOrChatAdmin, sanitizeBody, messageController.updateMessage);

/**
 * @swagger
 * /api/v1/message/{id}:
 *   delete:
 *     summary: Soft delete a message (admin)
 *     tags: [Messages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Message soft deleted
 */
router.delete('/:id', requireAppAdmin, messageController.deleteMessage);

export default router;
