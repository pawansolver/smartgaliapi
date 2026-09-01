import express from 'express';
import * as serviceBookingController from './service_booking.controller.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ServiceBookings
 *   description: Service Booking management APIs
 */

/**
 * @swagger
 * /api/v1/service-booking:
 *   post:
 *     summary: Create a new service booking
 *     tags: [ServiceBookings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               listing_id:
 *                 type: integer
 *               user_id:
 *                 type: integer
 *               scheduled_at:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, completed, cancelled]
 *               amount:
 *                 type: number
 *               created_by:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Service booking created successfully
 */
router.post('/', serviceBookingController.createBooking);

/**
 * @swagger
 * /api/v1/service-booking:
 *   get:
 *     summary: Get all active service bookings
 *     tags: [ServiceBookings]
 *     responses:
 *       200:
 *         description: A list of service bookings
 */
router.get('/', serviceBookingController.getAllBookings);

/**
 * @swagger
 * /api/v1/service-booking/bulk-delete:
 *   post:
 *     summary: Bulk soft delete service bookings
 *     tags: [ServiceBookings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               deletedRemarks:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Service bookings deleted successfully (bulk soft delete)
 */
router.post('/bulk-delete', serviceBookingController.bulkDeleteBookings);

/**
 * @swagger
 * /api/v1/service-booking/{id}:
 *   get:
 *     summary: Get a service booking by ID
 *     tags: [ServiceBookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Service booking data
 *       404:
 *         description: Service booking not found
 */
router.get('/:id', serviceBookingController.getBookingById);

/**
 * @swagger
 * /api/v1/service-booking/{id}:
 *   put:
 *     summary: Update a service booking
 *     tags: [ServiceBookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scheduled_at:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, completed, cancelled]
 *               amount:
 *                 type: number
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Service booking updated successfully
 *       404:
 *         description: Service booking not found
 */
router.put('/:id', serviceBookingController.updateBooking);

/**
 * @swagger
 * /api/v1/service-booking/{id}:
 *   delete:
 *     summary: Soft delete a service booking
 *     tags: [ServiceBookings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deletedRemarks:
 *                 type: string
 *               updated_by:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Service booking deleted successfully (soft delete)
 *       404:
 *         description: Service booking not found
 */
router.delete('/:id', serviceBookingController.deleteBooking);

export default router;
