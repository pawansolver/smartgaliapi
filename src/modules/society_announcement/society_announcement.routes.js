import express from 'express';
import * as societyAnnouncementController from './society_announcement.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
  listAnnouncementQuerySchema,
  bulkDeleteAnnouncementSchema,
} from '../society_profile/society.validation.js';
import { requireSocietyMember, requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import { uploadAnnouncementAttachmentFile } from '../../utils/fileUpload.js';
import {
  societyReadLimiter,
  societyMutationLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

router.post(
  '/',
  authenticate,
  societyMutationLimiter,
  requireSocietyRole(['admin', 'committee']),
  validateBody(createAnnouncementSchema),
  societyAnnouncementController.createAnnouncement
);

router.post(
  '/upload-attachment',
  authenticate,
  societyMutationLimiter,
  uploadAnnouncementAttachmentFile('announcements').single('file'),
  requireSocietyRole(['admin', 'committee']),
  societyAnnouncementController.uploadAttachment
);

router.post(
  '/bulk-delete',
  authenticate,
  societyMutationLimiter,
  requireSocietyRole(['admin', 'committee']),
  validateBody(bulkDeleteAnnouncementSchema),
  societyAnnouncementController.bulkDeleteAnnouncements
);

router.get(
  '/',
  authenticate,
  societyReadLimiter,
  validateQuery(listAnnouncementQuerySchema),
  requireSocietyMember,
  societyAnnouncementController.getAllAnnouncements
);

router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyAnnouncementController.getAnnouncementById
);

router.put(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  validateBody(updateAnnouncementSchema),
  societyAnnouncementController.updateAnnouncement
);

router.put(
  '/:id/archive',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  societyAnnouncementController.archiveAnnouncement
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  societyAnnouncementController.deleteAnnouncement
);

export default router;
