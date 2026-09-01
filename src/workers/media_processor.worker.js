import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { auditUpload } from '../modules/audit_log/audit_log.service.js';

/**
 * Media Processor Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * Event-driven background processor — uses Node.js EventEmitter so it runs
 * on the same process but does NOT block the HTTP request cycle.
 *
 * Architecture:
 *   upload endpoint → res.json() → mediaWorker.emit('process', job) → async
 *
 * In production, swap the EventEmitter for BullMQ + Redis queues for
 * multi-instance reliability (just change the emit/on below).
 *
 * Jobs supported:
 *  1. extractMetadata  — read file stats, set basic metadata
 *  2. generateThumbnail — placeholder hook for sharp/ffmpeg integration
 *  3. virusScan        — placeholder hook for ClamAV / VirusTotal
 * ─────────────────────────────────────────────────────────────────────────────
 */

class MediaWorker extends EventEmitter {}
export const mediaWorker = new MediaWorker();

// Prevent unhandled event crashes
mediaWorker.setMaxListeners(50);
mediaWorker.on('error', (err) => logger.error('WORKER', 'mediaWorker error', { error: err.message }));

// ─────────────────────────────────────────────────────────────────────────────
// Job: PROCESS — dispatched immediately after upload, before client response
// ─────────────────────────────────────────────────────────────────────────────
mediaWorker.on('process', async (job) => {
  const { filePath, filename, mimeType, uploadedBy, messageType } = job;

  logger.info('WORKER', 'media_process_start', { filename, mimeType, uploadedBy });

  // Run all steps concurrently where possible
  await Promise.allSettled([
    extractMetadata(job),
    generateThumbnail(job),
    virusScanHook(job),
  ]);

  // Fire audit log (non-critical)
  auditUpload({
    actorId:    uploadedBy,
    targetId:   null,
    after: { filename, mimeType, messageType },
  }).catch(() => {});

  logger.uploadSuccess({ filename, mimeType, uploadedBy });
});

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Extract Metadata
// ─────────────────────────────────────────────────────────────────────────────
const extractMetadata = async ({ filePath, filename, mimeType }) => {
  try {
    const stat = fs.statSync(filePath);
    const metadata = {
      file_size: stat.size,
      mime_type: mimeType,
      extension: path.extname(filename).toLowerCase(),
    };
    logger.debug('WORKER', 'metadata_extracted', { filename, ...metadata });
    return metadata;
  } catch (err) {
    logger.warn('WORKER', 'metadata_extract_failed', { filename, error: err.message });
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Thumbnail Generation (Hook — integrate sharp/ffmpeg here)
// ─────────────────────────────────────────────────────────────────────────────
const generateThumbnail = async ({ filePath, filename, mimeType, messageType }) => {
  if (!['image', 'video'].includes(messageType)) return null;

  try {
    // ── Image thumbnail via sharp ─────────────────────────────────────────────
    // To enable: npm install sharp
    // const sharp = await import('sharp');
    // const thumbPath = filePath.replace(/(\.\w+)$/, '_thumb$1');
    // await sharp.default(filePath).resize(200, 200, { fit: 'cover' }).toFile(thumbPath);
    // return `/uploads/${path.basename(thumbPath)}`;

    // ── Video thumbnail via ffmpeg ────────────────────────────────────────────
    // To enable: npm install fluent-ffmpeg
    // Use ffmpeg to extract frame at 00:00:01

    logger.debug('WORKER', 'thumbnail_hook_ready', { filename, messageType });
    return null; // placeholder — replace with actual implementation
  } catch (err) {
    logger.warn('WORKER', 'thumbnail_failed', { filename, error: err.message });
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Virus Scan Hook (integrate ClamAV / VirusTotal here)
// ─────────────────────────────────────────────────────────────────────────────
const virusScanHook = async ({ filePath, filename }) => {
  try {
    // ── ClamAV integration ───────────────────────────────────────────────────
    // To enable: npm install clamscan
    // const ClamScan = await import('clamscan');
    // const scanner = await new ClamScan().init();
    // const { isInfected, file, viruses } = await scanner.scanFile(filePath);
    // if (isInfected) {
    //   fs.unlinkSync(filePath);
    //   logger.warn('WORKER', 'virus_detected', { filename, viruses });
    // }

    logger.debug('WORKER', 'virus_scan_hook_ready', { filename });
  } catch (err) {
    logger.warn('WORKER', 'virus_scan_failed', { filename, error: err.message });
  }
};

/**
 * Dispatch a media processing job.
 * Call this immediately after saving the file to disk.
 *
 * @param {object} job
 * @param {string} job.filePath     - absolute path to the uploaded file
 * @param {string} job.filename     - filename on disk
 * @param {string} job.mimeType
 * @param {string} job.messageType  - image|video|audio|document
 * @param {number} job.uploadedBy   - userId
 */
export const dispatchMediaJob = (job) => {
  // setImmediate ensures this runs AFTER the current call stack (non-blocking)
  setImmediate(() => mediaWorker.emit('process', job));
};

export default mediaWorker;
