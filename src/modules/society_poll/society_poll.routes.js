import express from 'express';
import * as pollController from './society_poll.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SocietyPolls
 *   description: Society Poll management APIs
 */

router.post('/', pollController.createPoll);
router.get('/', pollController.getAllPolls);
router.get('/:id', pollController.getPollById);
router.put('/:id', pollController.updatePoll);
router.put('/:id/status', pollController.updatePollStatus);
router.delete('/:id', pollController.deletePoll);

export default router;
