import fs from 'fs';
import path from 'path';
import { successResponse, errorResponse } from '../../utils/response.js';
import * as chatService from './chat.service.js';
import env from '../../config/env.js';

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE APIs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/chat/my-chats?userId=:userId
 * Returns current user's chat list with last message, unread count, online status.
 */
export const getMyChats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    if (!userId) return errorResponse(res, 400, 'userId is required');
    const chats = await chatService.getMyChats(userId);
    return successResponse(res, 200, 'Chat list fetched successfully', chats);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/chat/one-to-one
 * Body: { userId, targetUserId | phoneNumber, created_by }
 * Idempotent — returns existing chat or creates a new one.
 */
export const getOrCreateOneToOneChat = async (req, res, next) => {
  try {
    const { targetUserId, phoneNumber } = req.body;
    const userId = req.user.id;
    const created_by = req.user.id;
    if (!userId) return errorResponse(res, 400, 'userId is required');
    const resolvedTargetUserId = await chatService.resolveOneToOneTarget({
      targetUserId,
      phoneNumber,
    });
    if (String(userId) === String(resolvedTargetUserId)) return errorResponse(res, 400, 'Cannot create a chat with yourself');
    const result = await chatService.getOrCreateOneToOneChat({
      userId,
      targetUserId: resolvedTargetUserId,
      created_by: created_by ?? userId,
    });
    const status = result.created ? 201 : 200;
    return successResponse(res, status, result.created ? 'Chat created' : 'Existing chat returned', result.chat);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/chat/group
 * Body: { name, description, avatar_url, participantIds: [], created_by }
 */
export const createGroupChat = async (req, res, next) => {
  try {
    const { name, description, avatar_url, participantIds } = req.body;
    const created_by = req.user.id;
    if (!name)                           return errorResponse(res, 400, 'name is required');
    if (!created_by)                     return errorResponse(res, 400, 'created_by is required');
    if (!Array.isArray(participantIds))  return errorResponse(res, 400, 'participantIds must be an array');
    const chat = await chatService.createGroupChat({ name, description, avatar_url, participantIds, created_by });
    return successResponse(res, 201, 'Group chat created successfully', chat);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/chat/:chatId/mute
 * Body: { userId, is_muted, muted_until? }
 */
export const muteChat = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { is_muted, muted_until } = req.body;
    const userId = req.user.id;
    if (!userId) return errorResponse(res, 400, 'userId is required');
    const result = await chatService.muteChat({ chatId, userId, is_muted, muted_until });
    return successResponse(res, 200, `Chat ${is_muted ? 'muted' : 'unmuted'} successfully`, result);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/chat/:chatId/pin
 * Body: { userId, is_pinned }
 */
export const pinChat = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { is_pinned } = req.body;
    const userId = req.user.id;
    if (!userId) return errorResponse(res, 400, 'userId is required');
    const result = await chatService.pinChat({ chatId, userId, is_pinned });
    return successResponse(res, 200, `Chat ${is_pinned ? 'pinned' : 'unpinned'} successfully`, result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/chat/upload-attachment
 * Multipart/form-data: file field = "attachment"
 * Returns { media_url, media_metadata, message_type }
 */
export const uploadAttachment = async (req, res, next) => {
  try {
    console.log('\n🚀 ============ UPLOAD ATTACHMENT HIT ============ 🚀');
    console.log('📁 env.uploadsPath (express.static serves FROM here):', env.uploadsPath);
    console.log('📂 process.cwd():', process.cwd());

    if (!req.file) {
      console.log('❌ No req.file found! Multer did not parse the body.');
      return errorResponse(res, 400, 'No file uploaded. Use field name "attachment"');
    }

    // ── CRITICAL PATH CHECK ───────────────────────────────────────────────────
    console.log('✅ req.file.path   (multer saved file HERE):', req.file.path);
    console.log('✅ req.file.filename:', req.file.filename);
    console.log('✅ req.file.mimetype:', req.file.mimetype);
    console.log('✅ req.file.size:', req.file.size, 'bytes');

    // Verify the file physically exists where multer claims it saved it
    const fileExistsOnDisk = fs.existsSync(req.file.path);
    console.log('📌 File EXISTS on disk at req.file.path?', fileExistsOnDisk);

    // Check if multer saved it in the EXPECTED location (env.uploadsPath)
    const expectedPath = path.join(env.uploadsPath, req.file.filename);
    const existsAtExpectedPath = fs.existsSync(expectedPath);
    console.log('📌 File EXISTS at EXPECTED path (env.uploadsPath)?', existsAtExpectedPath);
    console.log('   Expected path:', expectedPath);

    if (!fileExistsOnDisk) {
      console.error('❌ CRITICAL: File does NOT exist at req.file.path — upload failed silently!');
    }
    if (!existsAtExpectedPath) {
      console.error('❌ PATH MISMATCH: File saved to a different folder than express.static serves!');
      console.error('   Multer saved to :', req.file.path);
      console.error('   express.static looks in:', env.uploadsPath);
    }
    // ── END PATH CHECK ────────────────────────────────────────────────────────

    const result = chatService.saveUploadedAttachment(req.file);
    
    // Dispatch background worker for metadata extraction / thumbnails
    const { dispatchMediaJob } = await import('../../workers/media_processor.worker.js');
    dispatchMediaJob({
      filePath:    req.file.path,
      filename:    req.file.filename,
      mimeType:    req.file.mimetype,
      uploadedBy:  req.user.id,
      messageType: result.message_type,
    });

    console.log('✅ [BACKEND] Upload SUCCESS. Returning URL:', result.media_url);
    console.log('================================================\n');
    return successResponse(res, 200, 'File uploaded successfully', result);
  } catch (error) {
    console.error('\n==================== ❌ UPLOAD ERROR ❌ ====================');
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('Request Body:', req.body);
    console.error('File Info:', req.file);
    console.error('============================================================\n');
    
    if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
    
    // Send exact error to the frontend/postman so it's visible in the response
    return res.status(500).json({ 
      success: false, 
      message: 'Upload failed', 
      error: error.message,
      stack: error.stack // (Remove in production)
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY CRUD (backward compatible)
// ─────────────────────────────────────────────────────────────────────────────

export const createChat = async (req, res, next) => {
  try {
    const chat = await chatService.createChat(req.body);
    return successResponse(res, 201, 'Chat created successfully', chat);
  } catch (error) {
    next(error);
  }
};

export const getAllChats = async (req, res, next) => {
  try {
    const chats = await chatService.getAllChats();
    return successResponse(res, 200, 'Chats fetched successfully', chats);
  } catch (error) {
    next(error);
  }
};

export const getChatById = async (req, res, next) => {
  try {
    const chat = await chatService.getChatById(req.params.id);
    if (!chat) return errorResponse(res, 404, 'Chat not found');
    return successResponse(res, 200, 'Chat fetched successfully', chat);
  } catch (error) {
    next(error);
  }
};

export const updateChat = async (req, res, next) => {
  try {
    const chat = await chatService.updateChat(req.params.id, req.body);
    if (!chat) return errorResponse(res, 404, 'Chat not found');
    return successResponse(res, 200, 'Chat updated successfully', chat);
  } catch (error) {
    next(error);
  }
};

export const deleteChat = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const chat = await chatService.softDeleteChat(req.params.id, deletedRemarks, updated_by);
    if (!chat) return errorResponse(res, 404, 'Chat not found');
    return successResponse(res, 200, 'Chat deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const bulkDeleteChats = async (req, res, next) => {
  try {
    const { ids, deletedRemarks, updated_by } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0)
      return errorResponse(res, 400, 'Please provide an array of ids');
    const result = await chatService.bulkSoftDeleteChats(ids, deletedRemarks, updated_by);
    return successResponse(res, 200, 'Chats deleted successfully (bulk soft delete)', result);
  } catch (error) {
    next(error);
  }
};
