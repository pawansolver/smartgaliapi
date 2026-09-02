import express from 'express';
import * as eventParticipantController from './event_participant.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = express.Router();

// Enforce authentication on all participant routes
router.use(authenticate);

router.post('/', eventParticipantController.createParticipant);
router.get('/', eventParticipantController.getAllParticipants);
router.post('/bulk-delete', eventParticipantController.bulkDeleteParticipants);
router.get('/:id', eventParticipantController.getParticipantById);
router.put('/:id', eventParticipantController.updateParticipant);
router.delete('/:id', eventParticipantController.deleteParticipant);

export default router;
