import express from 'express';
import * as userProfileController from './userProfile.controller.js';
import { validate, sendOtpSchema, verifyOtpSchema } from './userProfile.validation.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = express.Router();


// ═══════════════════════════════════════════════════════════════
// MOBILE OTP LOGIN ROUTES
// ═══════════════════════════════════════════════════════════════

/**
 * @swagger
 * tags:
 *   - name: OTP Auth
 *     description: Mobile OTP Authentication APIs
 *   - name: UserProfiles
 *     description: User Profile management APIs
 */

/**
 * @swagger
 * /api/v1/user-profile/send-otp:
 *   post:
 *     summary: Request an OTP for mobile login
 *     tags: [OTP Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "9876543210"
 *                 description: 10-digit Indian mobile number (optionally prefixed with +91 or 91)
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     phoneNumber:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       422:
 *         description: Validation error
 */
router.post('/send-otp', validate(sendOtpSchema), userProfileController.sendOTP);

/**
 * @swagger
 * /api/v1/user-profile/resend-otp:
 *   post:
 *     summary: Resend OTP to user's email with rate limiting
 *     tags: [OTP Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: OTP resent successfully
 *       429:
 *         description: Too many requests (Rate limited)
 *       404:
 *         description: User not found
 */
router.post('/resend-otp', userProfileController.resendOTP);

/**
 * @swagger
 * /api/v1/user-profile/verify-otp:
 *   post:
 *     summary: Verify OTP and receive JWT access token
 *     tags: [OTP Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - otp
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "9876543210"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *                 description: Exactly 6 digits
 *     responses:
 *       200:
 *         description: OTP verified. Returns JWT token and user details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     tokenType:
 *                       type: string
 *                       example: Bearer
 *                     expiresIn:
 *                       type: string
 *                       example: 30d
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         phone:
 *                           type: string
 *                         role:
 *                           type: string
 *       400:
 *         description: OTP expired or invalid
 *       404:
 *         description: User not found
 *       422:
 *         description: Validation error
 */
router.post('/verify-otp', validate(verifyOtpSchema), userProfileController.verifyOTP);

/**
 * @swagger
 * /api/v1/user-profile/complete-setup:
 *   put:
 *     summary: Complete user profile setup with conditional role execution
 *     tags: [UserProfiles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [resident, shopkeeper, provider]
 *     responses:
 *       200:
 *         description: Profile setup completed successfully
 *       400:
 *         description: Invalid or missing role
 */
router.put('/complete-setup', authenticate, userProfileController.completeProfileSetup);

/**
 * @swagger
 * /api/v1/user-profile/upload-banner:
 *   post:
 *     summary: Upload shop/provider banner image
 *     tags: [UserProfiles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               banner:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Banner uploaded successfully
 */
router.post('/upload-banner', authenticate, userProfileController.uploadBanner);

export default router;
