import express from 'express';
import * as parkingController from './society_parking.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: SocietyParking
 *   description: Society Parking management APIs
 */

router.post('/', parkingController.createParking);
router.get('/', parkingController.getAllParkings);
router.get('/:id', parkingController.getParkingById);
router.put('/:id', parkingController.updateParking);
router.delete('/:id', parkingController.deleteParking);

export default router;
