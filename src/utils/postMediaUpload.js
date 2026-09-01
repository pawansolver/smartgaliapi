/**
 * Post Media Upload Utility — Phase 9
 * ─────────────────────────────────────────────────────────────────────────────
 * Multer-based upload for post images and videos.
 * Reuses the same MIME validation + magic-byte verification pattern as
 * chatAttachmentUpload.js (Phase 6).
 *
 * Limits:
 *   Images: 10 MB
 *   Videos: 100 MB
 *
 * Security:
 *   - MIME type whitelist enforced at filter stage
 *   - Magic-byte validation post-upload (content vs declared type)
 *   - Random UUID filename — no path traversal via original filename
 *   - Local disk storage, same as chat attachments
 */

import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import env from '../config/env.js';
import { contentMatchesMime } from './chatAttachmentUpload.js';

// Allowed MIME types for post media only (subset of chat types)
export const POST_MEDIA_TYPES = Object.freeze({
  'image/jpeg':    { ext: '.jpg',  kind: 'image', maxMB: 10 },
  'image/jpg':     { ext: '.jpg',  kind: 'image', maxMB: 10 },
  'image/png':     { ext: '.png',  kind: 'image', maxMB: 10 },
  'image/gif':     { ext: '.gif',  kind: 'image', maxMB: 10 },
  'image/webp':    { ext: '.webp', kind: 'image', maxMB: 10 },
  'image/heic':    { ext: '.heic', kind: 'image', maxMB: 10 },
  'image/heif':    { ext: '.heif', kind: 'image', maxMB: 10 },
  'video/mp4':     { ext: '.mp4',  kind: 'video', maxMB: 100 },
  'video/quicktime': { ext: '.mov', kind: 'video', maxMB: 100 },
  'video/webm':    { ext: '.webm', kind: 'video', maxMB: 100 },
  'video/x-msvideo': { ext: '.avi', kind: 'video', maxMB: 100 },
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(env.uploadsPath, { recursive: true }, (err) => cb(err, env.uploadsPath));
  },
  filename: (_req, file, cb) => {
    const type = POST_MEDIA_TYPES[file.mimetype];
    if (!type) {
      return cb(Object.assign(new Error('Unsupported media type'), { code: 'INVALID_MEDIA_TYPE' }));
    }
    return cb(null, `post_${crypto.randomUUID()}${type.ext}`);
  },
});

export const postMediaUpload = multer({
  storage,
  limits: { files: 1, fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!POST_MEDIA_TYPES[file.mimetype]) {
      return cb(Object.assign(new Error('Unsupported media type. Use image or video.'), { code: 'INVALID_MEDIA_TYPE' }));
    }
    return cb(null, true);
  },
});

/**
 * Post-upload validation middleware:
 *   1. Enforces per-type file size limits
 *   2. Validates magic bytes against declared MIME type
 *   3. Cleans up file on failure
 */
export const validatePostMedia = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const type = POST_MEDIA_TYPES[req.file.mimetype];
    if (!type) {
      throw Object.assign(new Error('Unsupported media type'), { code: 'INVALID_MEDIA_TYPE' });
    }

    const maxBytes = type.maxMB * 1024 * 1024;
    if (req.file.size > maxBytes) {
      throw Object.assign(
        new Error(`${type.kind} files must be ${type.maxMB} MB or smaller`),
        { code: 'MEDIA_TOO_LARGE' },
      );
    }

    // Magic-byte verification
    const handle = await fs.promises.open(req.file.path, 'r');
    const buffer = Buffer.alloc(32);
    try {
      await handle.read(buffer, 0, buffer.length, 0);
    } finally {
      await handle.close();
    }
    if (!contentMatchesMime(buffer, req.file.mimetype)) {
      throw Object.assign(
        new Error('File content does not match its declared MIME type'),
        { code: 'INVALID_MEDIA_CONTENT' },
      );
    }

    req.file.mediaKind = type.kind; // 'image' | 'video'
    return next();
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return next(error);
  }
};
