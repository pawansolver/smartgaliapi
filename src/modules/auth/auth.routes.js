import express from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  authOtpSendLimiter,
  authOtpVerifyLimiter,
  authRefreshLimiter,
  authResetLimiter,
  authSigninLimiter,
  authSignupLimiter,
} from '../../middleware/rateLimit.middleware.js';
import * as controller from './auth.controller.js';
import {
  createPasswordSchema,
  deleteAuthAccountSchema,
  forgotPasswordSchema,
  logoutSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  signinSchema,
  signupSchema,
  updateAuthProfileSchema,
  validate,
  verifyResetOtpSchema,
  verifySignupOtpSchema,
} from './auth.validation.js';

const router = express.Router();

router.post('/signup', authSignupLimiter, authOtpSendLimiter, validate(signupSchema), controller.signup);
router.post(
  '/verify-email-otp',
  authOtpVerifyLimiter,
  validate(verifySignupOtpSchema),
  controller.verifyEmailOtp,
);
router.post('/create-password', authResetLimiter, validate(createPasswordSchema), controller.createPassword);
router.post('/signin', authSigninLimiter, validate(signinSchema), controller.signin);
router.post(
  '/forgot-password',
  authOtpSendLimiter,
  validate(forgotPasswordSchema),
  controller.forgotPassword,
);
router.post(
  '/verify-reset-otp',
  authOtpVerifyLimiter,
  validate(verifyResetOtpSchema),
  controller.verifyResetOtp,
);
router.post('/reset-password', authResetLimiter, validate(resetPasswordSchema), controller.resetPassword);
router.post('/refresh-token', authRefreshLimiter, validate(refreshTokenSchema), controller.refreshToken);
router.post('/logout', authRefreshLimiter, validate(logoutSchema), controller.logout);

router.get('/profile', authenticate, controller.getProfile);
router.put('/profile', authenticate, validate(updateAuthProfileSchema), controller.updateProfile);
router.delete(
  '/account',
  authenticate,
  validate(deleteAuthAccountSchema),
  controller.deleteAccount,
);

export default router;
