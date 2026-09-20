import express from 'express';
import * as societyComplaintController from './society_complaint.controller.js';
import SocietyComplaint from './society_complaint.model.js';
import { errorResponse } from '../../utils/response.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.middleware.js';
import {
  idParamSchema,
  createComplaintSchema,
  updateComplaintStatusSchema,
  assignComplaintSchema,
  listComplaintQuerySchema,
} from '../society_profile/society.validation.js';
import { requireSocietyMember, requireSocietyRole } from '../../middleware/societyAuth.middleware.js';
import {
  societyReadLimiter,
  societyComplaintLimiter,
  societyMutationLimiter,
} from '../../middleware/rateLimit.middleware.js';

const router = express.Router();

// ── CREATE COMPLAINT ─────────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  societyComplaintLimiter,
  validateBody(createComplaintSchema),
  requireSocietyMember,
  societyComplaintController.createComplaint
);

// ── LIST COMPLAINTS ──────────────────────────────────────────────────────────
router.get(
  '/',
  authenticate,
  societyReadLimiter,
  validateQuery(listComplaintQuerySchema),
  requireSocietyMember,
  societyComplaintController.getAllComplaints
);

// ── COMPLAINT SUMMARY ─────────────────────────────────────────────────────────
router.get(
  '/summary',
  authenticate,
  societyReadLimiter,
  requireSocietyRole(['admin', 'committee']),
  societyComplaintController.getComplaintSummary
);

// ── GET COMPLAINT BY ID ───────────────────────────────────────────────────────
router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const complaint = await SocietyComplaint.findOne({
        where: { id: req.params.id, is_deleted: false },
      });
      if (!complaint) return errorResponse(res, 404, 'Society complaint not found');

      req.societyId = complaint.society_id;
      req.params.societyId = complaint.society_id;
      req.query.society_id = complaint.society_id;

      const actorUserId = req.user?.id || req.user?.userId;

      // Allow assigned worker or creator directly without requiring society membership
      if (Number(complaint.assigned_to) === Number(actorUserId) || Number(complaint.user_id) === Number(actorUserId)) {
        req.societyContext = {
          societyId: complaint.society_id,
          role: Number(complaint.assigned_to) === Number(actorUserId) ? 'worker' : 'resident',
        };
        return next();
      }

      return requireSocietyMember(req, res, next);
    } catch (err) {
      return next(err);
    }
  },
  societyComplaintController.getComplaintById
);

// ── UPDATE COMPLAINT STATUS ───────────────────────────────────────────────────
// Permission logic (in priority order):
//   1. Creator can close (from resolved) or reopen (from closed)
//   2. Assigned worker can accept (from assigned), start (from accepted), resolve (from in_progress)
//   3. Admin/committee can do any management transition
router.put(
  '/:id/status',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const complaint = await SocietyComplaint.findOne({
        where: { id: req.params.id, is_deleted: false },
      });
      if (!complaint) return errorResponse(res, 404, 'Society complaint not found');

      // Attach society context for downstream use
      req.body.society_id = complaint.society_id;
      req.params.societyId = complaint.society_id;

      const actorUserId = req.user?.id || req.user?.userId;
      const newStatus = req.body?.status;

      // Rule 1: Creator can close or reopen
      const isCreator = Number(complaint.user_id) === Number(actorUserId);
      const isCreatorAction = isCreator && (
        (newStatus === 'closed' && complaint.status === 'resolved') ||
        (newStatus === 'open' && complaint.status === 'closed')
      );
      if (isCreatorAction) {
        req.societyContext = { societyId: complaint.society_id };
        req.isCreatorAction = true;
        return next();
      }

      // Rule 2: Assigned worker can accept / start / resolve their OWN task
      const isAssignedWorker = complaint.assigned_to && Number(complaint.assigned_to) === Number(actorUserId);
      const workerTransitions = ['accepted', 'in_progress', 'resolved'];
      if (isAssignedWorker && workerTransitions.includes(newStatus)) {
        req.societyContext = { societyId: complaint.society_id };
        req.isWorkerAction = true;
        return next();
      }

      // Rule 3: Admin / committee for everything else
      return requireSocietyRole(['admin', 'committee'])(req, res, next);
    } catch (err) {
      return next(err);
    }
  },
  validateBody(updateComplaintStatusSchema),
  societyComplaintController.updateComplaintStatus
);

// ── ASSIGN COMPLAINT ──────────────────────────────────────────────────────────
router.put(
  '/:id/assign',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  validateBody(assignComplaintSchema),
  societyComplaintController.assignComplaint
);

// ── COMPLAINT HISTORY ─────────────────────────────────────────────────────────
router.get(
  '/:id/history',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const complaint = await SocietyComplaint.findOne({
        where: { id: req.params.id, is_deleted: false },
      });
      if (!complaint) return errorResponse(res, 404, 'Society complaint not found');

      req.societyId = complaint.society_id;
      req.params.societyId = complaint.society_id;
      req.query.society_id = complaint.society_id;

      const actorUserId = req.user?.id || req.user?.userId;

      // Allow assigned worker or creator directly without requiring society membership
      if (Number(complaint.assigned_to) === Number(actorUserId) || Number(complaint.user_id) === Number(actorUserId)) {
        req.societyContext = {
          societyId: complaint.society_id,
          role: Number(complaint.assigned_to) === Number(actorUserId) ? 'worker' : 'resident',
        };
        return next();
      }

      return requireSocietyMember(req, res, next);
    } catch (err) {
      return next(err);
    }
  },
  societyComplaintController.getComplaintHistory
);

// ── DELETE COMPLAINT ──────────────────────────────────────────────────────────
router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  societyComplaintController.deleteComplaint
);

export default router;
