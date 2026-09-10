/**
 * PRD Section 18.4 Unified Society REST Router
 * Provides standard endpoints:
 * - GET    /societies
 * - POST   /societies
 * - GET    /societies/:id
 * - PUT    /societies/:id
 * - DELETE /societies/:id
 * - GET    /societies/:id/members
 * - POST   /societies/:id/join
 * - POST   /societies/:id/leave
 * - GET    /societies/:id/announcements
 * - POST   /societies/:id/announcements
 * - GET    /societies/:id/complaints
 * - POST   /societies/:id/complaints
 * - PUT    /societies/complaints/:id
 */

import express from 'express';
import * as societyProfileController from './society_profile.controller.js';
import * as societyMemberController from '../society_member/society_member.controller.js';
import * as societyMemberService from '../society_member/society_member.service.js';
import * as societyAnnouncementController from '../society_announcement/society_announcement.controller.js';
import * as societyComplaintController from '../society_complaint/society_complaint.controller.js';
import SocietyMember from '../society_member/society_member.model.js';
import SocietyComplaint from '../society_complaint/society_complaint.model.js';
import { authenticate, optionalAuthenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createSocietyProfileSchema,
  updateSocietyProfileSchema,
  listSocietyProfileQuerySchema,
  transferOwnershipSchema,
  createAnnouncementSchema,
  createComplaintSchema,
  updateComplaintStatusSchema,
} from './society.validation.js';
import { requireSocietyMember, requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import {
  societyReadLimiter,
  societyMutationLimiter,
  societyComplaintLimiter,
} from '../../middleware/rateLimit.middleware.js';
import { successResponse, errorResponse } from '../../utils/response.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// PRD 18.4: PUT /societies/complaints/:id (Update complaint status)
// ---------------------------------------------------------------------------
router.put(
  '/complaints/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const complaint = await SocietyComplaint.findOne({ where: { id: req.params.id, is_deleted: false } });
      if (complaint) {
        req.body.society_id = complaint.society_id;
        req.params.societyId = complaint.society_id;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  },
  requireSocietyRole(['admin', 'committee']),
  validateBody(updateComplaintStatusSchema),
  societyComplaintController.updateComplaintStatus
);

// ---------------------------------------------------------------------------
// PRD 18.4: Society Profile CRUD
// ---------------------------------------------------------------------------
router.get(
  '/',
  optionalAuthenticate,
  societyReadLimiter,
  validateQuery(listSocietyProfileQuerySchema),
  societyProfileController.getAllProfiles
);

router.post(
  '/',
  authenticate,
  societyMutationLimiter,
  validateBody(createSocietyProfileSchema),
  societyProfileController.createProfile
);

router.get(
  '/:id',
  optionalAuthenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  societyProfileController.getProfileById
);

router.put(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  validateBody(updateSocietyProfileSchema),
  societyProfileController.updateProfile
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  societyProfileController.deleteProfile
);

router.post(
  '/:id/transfer-ownership',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  validateBody(transferOwnershipSchema),
  societyProfileController.transferOwnership
);

// ---------------------------------------------------------------------------
// PRD 18.4: Society Members & Join/Leave
// ---------------------------------------------------------------------------
router.get(
  '/:id/members',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  (req, res, next) => {
    req.query.society_id = req.params.id;
    return societyMemberController.getAllMembers(req, res, next);
  }
);

router.post(
  '/:id/join',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      const societyId = req.params.id;
      const member = await societyMemberService.createMember(societyId, userId, req.body, {
        requestId: req.correlationId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return successResponse(res, 201, 'Society membership request submitted successfully', member);
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/:id/leave',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      const societyId = req.params.id;
      const member = await SocietyMember.findOne({
        where: { society_id: societyId, user_id: userId, is_deleted: false },
      });
      if (!member) {
        return errorResponse(res, 404, 'You are not an active member of this society');
      }
      await societyMemberService.removeMember(member.id, societyId, req.body?.remark || 'User left society', userId, {
        requestId: req.correlationId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return successResponse(res, 200, 'Successfully left the society');
    } catch (error) {
      return next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PRD 18.4: Society Announcements
// ---------------------------------------------------------------------------
router.get(
  '/:id/announcements',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  (req, res, next) => {
    req.query.society_id = req.params.id;
    return societyAnnouncementController.getAllAnnouncements(req, res, next);
  }
);

router.post(
  '/:id/announcements',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  (req, res, next) => {
    req.body.society_id = Number(req.params.id);
    return next();
  },
  requireSocietyRole(['admin', 'committee']),
  validateBody(createAnnouncementSchema),
  societyAnnouncementController.createAnnouncement
);

// ---------------------------------------------------------------------------
// PRD 18.4: Society Complaints
// ---------------------------------------------------------------------------
router.get(
  '/:id/complaints',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  (req, res, next) => {
    req.query.society_id = req.params.id;
    return societyComplaintController.getAllComplaints(req, res, next);
  }
);

router.post(
  '/:id/complaints',
  authenticate,
  societyComplaintLimiter,
  validateParams(idParamSchema),
  (req, res, next) => {
    req.body.society_id = Number(req.params.id);
    return next();
  },
  requireSocietyMember,
  validateBody(createComplaintSchema),
  societyComplaintController.createComplaint
);

export default router;
