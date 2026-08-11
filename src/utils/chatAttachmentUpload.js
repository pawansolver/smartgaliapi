import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import env from '../config/env.js';

const TYPES = Object.freeze({
  'image/jpeg':  { ext: '.jpg',  kind: 'image', max: 10 },
  'image/jpg':   { ext: '.jpg',  kind: 'image', max: 10 },
  'image/png':   { ext: '.png',  kind: 'image', max: 10 },
  'image/gif':   { ext: '.gif',  kind: 'image', max: 10 },
  'image/webp':  { ext: '.webp', kind: 'image', max: 10 },
  'image/heic':  { ext: '.heic', kind: 'image', max: 10 }, // iPhone camera
  'image/heif':  { ext: '.heif', kind: 'image', max: 10 }, // iPhone camera alt
  'video/mp4':        { ext: '.mp4', kind: 'video', max: 100 },
  'video/quicktime':  { ext: '.mov', kind: 'video', max: 100 },
  'video/x-msvideo':  { ext: '.avi', kind: 'video', max: 100 },
  'video/webm':       { ext: '.webm', kind: 'video', max: 100 }, // Android/web video
  'audio/mpeg':   { ext: '.mp3',  kind: 'audio', max: 25 },
  'audio/aac':    { ext: '.aac',  kind: 'audio', max: 25 },
  'audio/mp4':    { ext: '.m4a',  kind: 'audio', max: 25 }, // Android voice notes
  'audio/m4a':    { ext: '.m4a',  kind: 'audio', max: 25 }, // iOS voice notes
  'audio/x-m4a':  { ext: '.m4a',  kind: 'audio', max: 25 }, // iOS voice notes alt
  'audio/webm':   { ext: '.webm', kind: 'audio', max: 25 }, // Web/Android Chrome
  'audio/wav':    { ext: '.wav',  kind: 'audio', max: 25 },
  'audio/ogg':    { ext: '.ogg',  kind: 'audio', max: 25 },
  'application/pdf': { ext: '.pdf', kind: 'document', max: 25 },
  'application/msword': { ext: '.doc', kind: 'document', max: 25 },
  'application/vnd.ms-excel': { ext: '.xls', kind: 'document', max: 25 },
  'application/vnd.ms-powerpoint': { ext: '.ppt', kind: 'document', max: 25 },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx', kind: 'document', max: 25 },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: '.xlsx', kind: 'document', max: 25 },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: '.pptx', kind: 'document', max: 25 },
});

const startsWith = (buffer, bytes) => bytes.every((byte, index) => buffer[index] === byte);
const ascii = (buffer, start, value) => buffer.subarray(start, start + value.length).toString('ascii') === value;

export const contentMatchesMime = (buffer, mime) => {
  if (!buffer?.length || !TYPES[mime]) return false;
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return startsWith(buffer, [0xff, 0xd8, 0xff]);
  }
  if (mime === 'image/png') return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === 'image/gif') return ascii(buffer, 0, 'GIF87a') || ascii(buffer, 0, 'GIF89a');
  if (mime === 'image/webp') return ascii(buffer, 0, 'RIFF') && ascii(buffer, 8, 'WEBP');
  if (mime === 'image/heic' || mime === 'image/heif') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    return ascii(buffer, 4, 'ftyp')
      && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
  }
  if (mime === 'application/pdf') return ascii(buffer, 0, '%PDF-');
  if (mime === 'video/x-msvideo') return ascii(buffer, 0, 'RIFF') && ascii(buffer, 8, 'AVI ');
  if (mime === 'audio/wav') return ascii(buffer, 0, 'RIFF') && ascii(buffer, 8, 'WAVE');
  if (mime === 'audio/ogg') return ascii(buffer, 0, 'OggS');
  if (mime === 'audio/mpeg') {
    return ascii(buffer, 0, 'ID3') || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  }
  if (mime === 'audio/aac') return buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;
  if (mime === 'video/webm' || mime === 'audio/webm') {
    return startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
  }
  if ([
    'video/mp4',
    'video/quicktime',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
  ].includes(mime)) return ascii(buffer, 4, 'ftyp');
  if (mime.includes('openxmlformats')) return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]);
  if (['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'].includes(mime)) {
    return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  return false;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(env.uploadsPath, { recursive: true }, (error) => cb(error, env.uploadsPath));
  },
  filename: (_req, file, cb) => {
    const type = TYPES[file.mimetype];
    if (!type) return cb(Object.assign(new Error('Unsupported attachment type'), { code: 'INVALID_ATTACHMENT_TYPE' }));
    return cb(null, `${crypto.randomUUID()}${type.ext}`);
  },
});

export const chatAttachmentUpload = multer({
  storage,
  limits: { files: 1, fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!TYPES[file.mimetype]) {
      // Calling cb(error) — NOT cb(error, false) — ensures multer forwards
      // the error to next() rather than silently dropping the file, which
      // would leave req.file undefined and trigger the wrong "No file uploaded"
      // error message in the controller.
      return cb(Object.assign(new Error('Unsupported attachment type'), { code: 'INVALID_ATTACHMENT_TYPE' }));
    }
    return cb(null, true);
  },
});

export const validateChatAttachment = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const type = TYPES[req.file.mimetype];
    if (req.file.size > type.max * 1024 * 1024) {
      throw Object.assign(new Error(`${type.kind} attachments must be ${type.max} MB or smaller`), {
        code: 'ATTACHMENT_TOO_LARGE',
      });
    }
    const handle = await fs.promises.open(req.file.path, 'r');
    const buffer = Buffer.alloc(32);
    try {
      await handle.read(buffer, 0, buffer.length, 0);
    } finally {
      await handle.close();
    }
    if (!contentMatchesMime(buffer, req.file.mimetype)) {
      throw Object.assign(new Error('Attachment content does not match its declared MIME type'), {
        code: 'INVALID_ATTACHMENT_CONTENT',
      });
    }
    req.file.sha256 = await new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      fs.createReadStream(req.file.path)
        .on('error', reject)
        .on('data', (chunk) => hash.update(chunk))
        .on('end', () => resolve(hash.digest('hex')));
    });
    req.file.messageType = type.kind;
    return next();
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return next(error);
  }
};
