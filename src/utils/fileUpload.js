import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import env from '../config/env.js';

const IMAGE_EXTENSIONS = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
});

const COMMUNITY_DOCUMENT_EXTENSIONS = Object.freeze({
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
});

const COMMUNITY_MEDIA_EXTENSIONS = Object.freeze({
  ...IMAGE_EXTENSIONS,
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
});

export const isAllowedImageMime = (mimeType) => Boolean(IMAGE_EXTENSIONS[mimeType]);

export const safeFolder = (folderName) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(folderName)) {
    throw new Error('Invalid upload folder.');
  }
  return folderName;
};

/**
 * Global Image Upload Utility
 * This handles saving files locally in a structured folder format (e.g. uploads/profile/)
 * 
 * Future AWS S3 Migration:
 * When moving to AWS S3, you can replace `multer.diskStorage` below with `multer-s3`.
 * This ensures you don't need to change any of the routes using this middleware.
 */

export const uploadImage = (folderName = 'general') => {
  const folder = safeFolder(folderName);
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(env.uploadsPath, folder);
      
      // Automatically create the folder (e.g., uploads/profile) if it doesn't exist
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const extension = IMAGE_EXTENSIONS[file.mimetype];
      if (!extension) {
        const error = new Error('Only JPEG, PNG, WebP, and GIF images are allowed.');
        error.code = 'INVALID_IMAGE_TYPE';
        return cb(error);
      }
      cb(null, `${crypto.randomUUID()}${extension}`);
    }
  });

  const fileFilter = (req, file, cb) => {
    if (isAllowedImageMime(file.mimetype)) {
      cb(null, true);
    } else {
      const error = new Error('Only JPEG, PNG, WebP, and GIF images are allowed.');
      error.code = 'INVALID_IMAGE_TYPE';
      cb(error, false);
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB file size limit
  });
};

const uploadTypedFile = (folderName, extensions, maxBytes) => {
  const folder = safeFolder(folderName);
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      const uploadPath = path.join(env.uploadsPath, folder);
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (_req, file, cb) => {
      const extension = extensions[file.mimetype];
      if (!extension) {
        const error = new Error('Unsupported file type.');
        error.code = 'INVALID_FILE_TYPE';
        return cb(error);
      }
      return cb(null, `${crypto.randomUUID()}${extension}`);
    },
  });
  return multer({
    storage,
    fileFilter: (_req, file, cb) => extensions[file.mimetype]
      ? cb(null, true)
      : cb(Object.assign(new Error('Unsupported file type.'), { code: 'INVALID_FILE_TYPE' }), false),
    limits: { fileSize: maxBytes },
  });
};

export const uploadCommunityDocument = (folderName = 'community') =>
  uploadTypedFile(folderName, COMMUNITY_DOCUMENT_EXTENSIONS, 20 * 1024 * 1024);

export const uploadCommunityMedia = (folderName = 'community') =>
  uploadTypedFile(folderName, COMMUNITY_MEDIA_EXTENSIONS, 100 * 1024 * 1024);

/**
 * Helper to get the full URL of the uploaded image.
 * 
 * Future AWS S3 Migration:
 * When you shift to AWS, just change this function to return the S3 URL 
 * (which might be directly available in `file.location` using multer-s3).
 */
export const getImageUrl = (req, file, folderName = 'general') => {
  if (!file) return null;
  
  // For AWS S3: return file.location;
  
  // For Local Storage:
  const folder = safeFolder(folderName);
  return `${env.publicMediaOrigin}/uploads/${folder}/${file.filename}`;
};

export const removeLocalUpload = async (fileUrl) => {
  if (!fileUrl) return false;

  let pathname;
  try {
    const mediaOrigin = new URL(env.publicMediaOrigin);
    const url = new URL(fileUrl, env.publicMediaOrigin);
    if (url.origin !== mediaOrigin.origin || !url.pathname.startsWith('/uploads/')) return false;
    pathname = decodeURIComponent(url.pathname.slice('/uploads/'.length));
  } catch {
    return false;
  }

  const uploadsRoot = path.resolve(env.uploadsPath);
  const candidate = path.resolve(uploadsRoot, pathname);
  if (candidate === uploadsRoot || !candidate.startsWith(`${uploadsRoot}${path.sep}`)) return false;

  try {
    await fs.promises.unlink(candidate);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
