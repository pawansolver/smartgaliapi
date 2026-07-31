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
