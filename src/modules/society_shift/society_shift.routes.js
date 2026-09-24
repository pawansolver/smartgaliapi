import express from 'express';
import * as shiftCtrl from './society_shift.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireSocietyMember, requireSocietyPermission } from '../../middleware/societyAuth.middleware.js';

const router = express.Router();
router.use(authenticate);

router.get('/', requireSocietyMember, shiftCtrl.getShifts);
router.get('/:id', requireSocietyMember, shiftCtrl.getShiftById);

router.post('/', requireSocietyPermission('shift.create'), shiftCtrl.createShift);
router.put('/:id', requireSocietyPermission('shift.edit'), shiftCtrl.updateShift);
router.delete('/:id', requireSocietyPermission('shift.assign'), shiftCtrl.deleteShift);

export default router;
