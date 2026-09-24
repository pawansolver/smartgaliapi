import express from 'express';
import * as gateCtrl from './society_gate.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { requireSocietyMember, requireSocietyPermission } from '../../middleware/societyAuth.middleware.js';

const router = express.Router();
router.use(authenticate);

router.get('/', requireSocietyMember, gateCtrl.getGates);
router.get('/:id', requireSocietyMember, gateCtrl.getGateById);

router.post('/', requireSocietyPermission('gate.create'), gateCtrl.createGate);
router.put('/:id', requireSocietyPermission('gate.edit'), gateCtrl.updateGate);
router.delete('/:id', requireSocietyPermission('gate.deactivate'), gateCtrl.deleteGate);

export default router;
