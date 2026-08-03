import { successResponse, errorResponse } from '../../utils/response.js';
import { logger } from '../../utils/logger.js';
import { audit } from '../audit_log/audit_log.service.js';
import * as authService from './auth.service.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
});

const recordAuthAudit = (req, actorId, action) => {
  if (!actorId) return;
  void audit({
    actorId,
    action,
    targetType: 'user',
    targetId: actorId,
    ip: req.ip,
    ua: req.get('user-agent'),
  });
};

export const signup = async (req, res, next) => {
  try {
    const data = await authService.signup(req.body);
    logger.info('AUTH', 'signup_otp_sent', { emailDomain: data.email.split('@')[1] });
    return successResponse(res, 202, 'Verification code sent to your email.', data);
  } catch (error) { return next(error); }
};

export const verifyEmailOtp = async (req, res, next) => {
  try {
    const data = await authService.verifySignupOtp(req.body);
    return successResponse(res, 200, 'Email verified. Create your password to finish signup.', data);
  } catch (error) { return next(error); }
};

export const createPassword = async (req, res, next) => {
  try {
    const data = await authService.createPassword(req.body);
    recordAuthAudit(req, data.user.id, 'auth.signup_completed');
    return successResponse(res, 201, 'Account created successfully.', data);
  } catch (error) { return next(error); }
};

export const signin = async (req, res, next) => {
  try {
    const data = await authService.signin(req.body, requestContext(req));
    recordAuthAudit(req, data.user.id, 'auth.signin');
    return successResponse(res, 200, 'Signed in successfully.', data);
  } catch (error) { return next(error); }
};

export const forgotPassword = async (req, res, next) => {
  try {
    await authService.forgotPassword(req.body);
    return successResponse(
      res,
      200,
      'If an eligible account exists, a verification code has been sent to its email.',
      null,
    );
  } catch (error) { return next(error); }
};

export const verifyResetOtp = async (req, res, next) => {
  try {
    const data = await authService.verifyResetOtp(req.body);
    return successResponse(res, 200, 'Verification successful.', data);
  } catch (error) { return next(error); }
};

export const resetPassword = async (req, res, next) => {
  try {
    const data = await authService.resetPassword(req.body);
    recordAuthAudit(req, data.userId, 'auth.password_reset');
    return successResponse(res, 200, 'Password reset successfully. Please sign in again.', null);
  } catch (error) { return next(error); }
};

export const refreshToken = async (req, res, next) => {
  try {
    const data = await authService.refresh(req.body, requestContext(req));
    return successResponse(res, 200, 'Tokens refreshed successfully.', data);
  } catch (error) { return next(error); }
};

export const logout = async (req, res, next) => {
  try {
    const userId = await authService.logout(req.body);
    recordAuthAudit(req, userId, 'auth.logout');
    return successResponse(res, 200, 'Logged out successfully.', null);
  } catch (error) { return next(error); }
};

export const getProfile = async (req, res, next) => {
  try {
    const profile = await authService.getProfile(req.user.id);
    if (!profile) return errorResponse(res, 404, 'Profile not found.');
    return successResponse(res, 200, 'Profile fetched successfully.', profile);
  } catch (error) { return next(error); }
};

export const updateProfile = async (req, res, next) => {
  try {
    const result = await authService.updateProfile(req.user.id, req.body);
    if (result.error) return errorResponse(res, result.status || 409, result.error);
    recordAuthAudit(req, req.user.id, 'auth.profile_updated');
    return successResponse(res, 200, 'Profile updated successfully.', result.data);
  } catch (error) { return next(error); }
};

export const deleteAccount = async (req, res, next) => {
  try {
    const result = await authService.deleteAccount(req.user.id, req.body);
    if (result.error) return errorResponse(res, result.status || 400, result.error);
    recordAuthAudit(req, req.user.id, 'auth.account_deleted');
    return successResponse(res, 200, 'Account deleted successfully.', null);
  } catch (error) { return next(error); }
};
