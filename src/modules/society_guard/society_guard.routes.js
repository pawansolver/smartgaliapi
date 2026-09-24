import express from 'express';
import * as guardCtrl from './society_guard.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireSocietyMember, requireSocietyPermission } from '../../middleware/societyAuth.middleware.js';
import { uploadImage, uploadSocietyDocument } from '../../utils/fileUpload.js';

const router = express.Router();
router.use(authenticate);

router.get('/my-duty', requireSocietyMember, guardCtrl.getMyDuty);
router.get('/', requireSocietyPermission('guard.read'), guardCtrl.getGuards);
router.get('/:id', requireSocietyPermission('guard.read'), guardCtrl.getGuardById);

router.post('/', requireSocietyPermission('guard.onboard'), guardCtrl.onboardGuard);
router.put('/:id/status', requireSocietyPermission('guard.activate'), guardCtrl.updateGuardStatus);
router.post('/assign', requireSocietyPermission('guard.assign_gate'), guardCtrl.assignGateAndShift);

// Photo management
router.post(
  '/photo',
  requireSocietyPermission('guard.onboard'),
  uploadImage('guards').single('photo'),
  guardCtrl.uploadPhoto
);
router.post(
  '/:id/photo',
  requireSocietyPermission('guard.onboard'),
  uploadImage('guards').single('photo'),
  guardCtrl.uploadPhoto
);
router.delete(
  '/:id/photo',
  requireSocietyPermission('guard.onboard'),
  guardCtrl.removePhoto
);

// Identity Document & Verification Workflow
router.post(
  '/id-document',
  requireSocietyPermission('guard.onboard'),
  uploadSocietyDocument('guard_documents').single('id_document'),
  guardCtrl.uploadIdDocument
);
router.post(
  '/:id/id-document',
  requireSocietyPermission('guard.onboard'),
  uploadSocietyDocument('guard_documents').single('id_document'),
  guardCtrl.uploadIdDocument
);
router.put(
  '/:id/verify',
  requireSocietyPermission('guard.verify'),
  guardCtrl.verifyGuard
);
router.put(
  '/:id/reject-verification',
  requireSocietyPermission('guard.verify'),
  guardCtrl.rejectVerification
);


router.put('/:id', requireSocietyPermission('guard.onboard'), guardCtrl.updateGuard);
router.delete('/:id', requireSocietyPermission('guard.onboard'), guardCtrl.deleteGuard);

export default router;
