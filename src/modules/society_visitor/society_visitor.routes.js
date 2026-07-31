import express from 'express';
import * as visitorController from './society_visitor.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SocietyVisitors
 *   description: Society Visitor management APIs
 */

router.post('/', visitorController.createVisitor);
router.get('/', visitorController.getAllVisitors);
router.get('/:id', visitorController.getVisitorById);
router.put('/:id', visitorController.updateVisitor);
router.put('/:id/status', visitorController.updateVisitorStatus);
router.delete('/:id', visitorController.deleteVisitor);

export default router;
