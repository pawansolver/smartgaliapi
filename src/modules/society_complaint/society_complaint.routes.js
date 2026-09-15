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

router.post(
  '/',
  authenticate,
  societyComplaintLimiter,
  validateBody(createComplaintSchema),
  requireSocietyMember,
  societyComplaintController.createComplaint
);

router.get(
  '/',
  authenticate,
  societyReadLimiter,
  validateQuery(listComplaintQuerySchema),
  requireSocietyMember,
  societyComplaintController.getAllComplaints
);

router.get(
  '/summary',
  authenticate,
  societyReadLimiter,
  requireSocietyRole(['admin', 'committee']),
  societyComplaintController.getComplaintSummary
);

router.get(
  '/:id',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyComplaintController.getComplaintById
);

router.put(
  '/:id/status',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const complaint = await SocietyComplaint.findOne({ where: { id: req.params.id, is_deleted: false } });
      if (!complaint) return errorResponse(res, 404, 'Society complaint not found');
      req.body.society_id = complaint.society_id;
      req.params.societyId = complaint.society_id;
      
      const actorUserId = req.user?.id || req.user?.userId;
      const isCreatorAction = Number(complaint.user_id) === Number(actorUserId) && 
        (req.body?.status === 'closed' || (['resolved', 'closed'].includes(complaint.status) && req.body?.status === 'open'));
      if (isCreatorAction) {
        req.isCreatorAction = true;
        req.societyContext = { societyId: complaint.society_id };
        return next();
      }
      return requireSocietyRole(['admin', 'committee'])(req, res, next);
    } catch (err) {
      return next(err);
    }
  },
  validateBody(updateComplaintStatusSchema),
  societyComplaintController.updateComplaintStatus
);

router.put(
  '/:id/assign',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin', 'committee']),
  validateBody(assignComplaintSchema),
  societyComplaintController.assignComplaint
);


router.get(
  '/:id/history',
  authenticate,
  societyReadLimiter,
  validateParams(idParamSchema),
  requireSocietyMember,
  societyComplaintController.getComplaintHistory
);

router.delete(
  '/:id',
  authenticate,
  societyMutationLimiter,
  validateParams(idParamSchema),
  requireSocietyRole(['admin']),
  societyComplaintController.deleteComplaint
);

export default router;
