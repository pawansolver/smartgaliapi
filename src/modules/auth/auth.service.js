import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import env from '../../config/env.js';
import { sendOtpEmail } from '../../utils/emailService.js';
import { logger } from '../../utils/logger.js';
import User from '../user/user.model.js';
import * as profileService from '../profile/profile.service.js';
import PendingSignup from './pending_signup.model.js';
import EmailOtp from './email_otp.model.js';
import RefreshToken from './refresh_token.model.js';
import {
  expiresAt,
  generateOtp,
  hashRefreshToken,
  hashValue,
  issueAccessToken,
  issueSessionToken,
  newRefreshToken,
  verifySessionToken,
} from './auth.tokens.js';
import { normalizeEmail, normalizeMobile } from './auth.validation.js';

const SALT_ROUNDS = 10;
const OTP_TTL_MS = 5 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const INVALID_CREDENTIALS = 'Invalid identifier or password.';
const INVALID_RESET = 'Invalid or expired verification code.';

const activeUserWhere = {
  is_deleted: false,
  is_active: true,
  status: 'active',
};

const identifierWhere = (identifier) => {
  if (identifier.includes('@')) return { email: normalizeEmail(identifier) };
  const mobile = normalizeMobile(identifier);
  return { phone: { [Op.in]: [mobile, `91${mobile}`, `+91${mobile}`] } };
};

const publicUser = (user) => ({
  id: user.userId,
  name: user.userName,
  email: user.email,
  mobile: user.phone,
  phone: user.phone,
  role: user.userRole || 'resident',
  isVerified: !!user.is_verified,
});

const authError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const createTokenPair = async (user, context = {}, options = {}) => {
  const rawRefreshToken = newRefreshToken();
  const familyId = options.familyId || crypto.randomUUID();
  const row = await RefreshToken.create({
    user_id: user.userId,
    token_hash: hashRefreshToken(rawRefreshToken),
    family_id: familyId,
    expires_at: expiresAt(env.auth.refreshTtl),
    created_by_ip: context.ip || null,
    user_agent: context.userAgent?.slice(0, 255) || null,
  }, { transaction: options.transaction });
  return {
    accessToken: issueAccessToken(user),
    refreshToken: rawRefreshToken,
    refreshTokenRow: row,
    tokenType: 'Bearer',
    expiresIn: env.auth.accessTtl,
    refreshExpiresIn: env.auth.refreshTtl,
    user: publicUser(user),
  };
};

const sendNewOtp = async ({ email, purpose, userId = null, pendingSignupId = null }) => {
  const rawOtp = generateOtp();
  const row = await EmailOtp.create({
    user_id: userId,
    pending_signup_id: pendingSignupId,
    email,
    purpose,
    otp_hash: await bcrypt.hash(rawOtp, SALT_ROUNDS),
    expires_at: new Date(Date.now() + OTP_TTL_MS),
  });
  try {
    await sendOtpEmail(email, rawOtp);
  } catch (error) {
    await row.destroy().catch(() => {});
    throw error;
  }
  return row;
};

const rejectOtherActiveOtps = (where, transaction) =>
  EmailOtp.update(
    { consumed_at: new Date() },
    { where: { ...where, consumed_at: null }, transaction },
  );

export const signup = async ({ name, mobile, email }) => {
  const cleanEmail = normalizeEmail(email);
  const cleanMobile = normalizeMobile(mobile);
  const existing = await User.findOne({
    where: {
      [Op.or]: [
        { email: cleanEmail },
        { phone: { [Op.in]: [cleanMobile, `91${cleanMobile}`, `+91${cleanMobile}`] } },
      ],
      is_deleted: false,
    },
    attributes: ['email', 'phone'],
  });
  if (existing?.email?.toLowerCase() === cleanEmail) throw authError('Email is already registered.', 409);
  if (existing) throw authError('Mobile number is already registered.', 409);

  // Preserve referenced signup rows: email_otps has a foreign key to this
  // table, so deleting an earlier attempt can fail under MySQL's default
  // RESTRICT behavior. Marking it consumed also invalidates its OTP/session.
  await PendingSignup.update({ consumed_at: new Date(), session_jti_hash: null }, {
    where: {
      [Op.or]: [{ email: cleanEmail }, { mobile: cleanMobile }],
      consumed_at: null,
    },
  });
  const pending = await PendingSignup.create({
    name,
    email: cleanEmail,
    mobile: cleanMobile,
    expires_at: new Date(Date.now() + PENDING_TTL_MS),
  });
  try {
    await sendNewOtp({ email: cleanEmail, purpose: 'signup', pendingSignupId: pending.id });
  } catch (error) {
    await pending.destroy().catch(() => {});
    throw error;
  }
  return { email: cleanEmail, expiresIn: '5m' };
};

export const verifySignupOtp = async ({ email, otp }) => {
  const cleanEmail = normalizeEmail(email);
  const transaction = await sequelize.transaction();
  try {
    const pending = await PendingSignup.findOne({
      where: {
        email: cleanEmail,
        consumed_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [['created_at', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!pending) throw authError('Invalid or expired verification code.');
    const otpRow = await EmailOtp.findOne({
      where: {
        pending_signup_id: pending.id,
        purpose: 'signup',
        consumed_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [['created_at', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!otpRow || otpRow.attempts >= MAX_OTP_ATTEMPTS) {
      throw authError('Invalid or expired verification code.');
    }
    const valid = await bcrypt.compare(otp, otpRow.otp_hash);
    if (!valid) {
      await otpRow.increment('attempts', { transaction });
      await transaction.commit();
      throw authError('Invalid or expired verification code.');
    }
    const jti = crypto.randomUUID();
    const sessionExpiry = expiresAt(env.auth.sessionTtl);
    await otpRow.update({ consumed_at: new Date() }, { transaction });
    await pending.update({
      email_verified_at: new Date(),
      session_jti_hash: hashValue(jti),
      session_expires_at: sessionExpiry,
    }, { transaction });
    await transaction.commit();
    return {
      signupSessionToken: issueSessionToken({ subject: pending.id, purpose: 'signup', jti }),
      expiresIn: env.auth.sessionTtl,
    };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

export const createPassword = async ({ signupSessionToken, password }) => {
  const payload = verifySessionToken(signupSessionToken, 'signup');
  const transaction = await sequelize.transaction();
  try {
    const pending = await PendingSignup.findByPk(payload.sub, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      !pending ||
      pending.consumed_at ||
      !pending.email_verified_at ||
      !pending.session_expires_at ||
      new Date(pending.session_expires_at) <= new Date() ||
      pending.session_jti_hash !== hashValue(payload.jti)
    ) throw authError('Invalid or expired signup session.', 401);

    const duplicate = await User.findOne({
      where: {
        [Op.or]: [
          { email: pending.email },
          { phone: { [Op.in]: [pending.mobile, `91${pending.mobile}`, `+91${pending.mobile}`] } },
        ],
        is_deleted: false,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (duplicate) throw authError('Email or mobile is already registered.', 409);

    const user = await User.create({
      userName: pending.name,
      email: pending.email,
      phone: pending.mobile,
      password: await bcrypt.hash(password, SALT_ROUNDS),
      userRole: 'resident',
      is_verified: true,
      status: 'active',
    }, { transaction });
    await pending.update({
      consumed_at: new Date(),
      session_jti_hash: null,
    }, { transaction });
    await transaction.commit();
    return {
      user: publicUser(user),
      requiresSignIn: true,
    };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw authError('Email or mobile is already registered.', 409);
    }
    throw error;
  }
};

export const signin = async ({ identifier, password }, context) => {
  const user = await User.findOne({ where: { ...identifierWhere(identifier), ...activeUserWhere } });
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    logger.securityBlock({ reason: 'invalid_credentials', identifierType: identifier.includes('@') ? 'email' : 'mobile' });
    throw authError(INVALID_CREDENTIALS, 401);
  }
  await user.update({ last_login: new Date() });
  const tokens = await createTokenPair(user, context);
  delete tokens.refreshTokenRow;
  return tokens;
};

export const forgotPassword = async ({ identifier }) => {
  const user = await User.findOne({ where: { ...identifierWhere(identifier), ...activeUserWhere } });
  if (!user?.email) return;
  try {
    await rejectOtherActiveOtps({ user_id: user.userId, purpose: 'password_reset' });
    await sendNewOtp({
      email: normalizeEmail(user.email),
      purpose: 'password_reset',
      userId: user.userId,
    });
  } catch (error) {
    logger.error('AUTH', 'password_reset_otp_delivery_failed', { userId: user.userId, error: error.message });
  }
};

export const verifyResetOtp = async ({ identifier, otp }) => {
  const user = await User.findOne({ where: { ...identifierWhere(identifier), ...activeUserWhere } });
  if (!user) throw authError(INVALID_RESET);
  const transaction = await sequelize.transaction();
  try {
    const otpRow = await EmailOtp.findOne({
      where: {
        user_id: user.userId,
        purpose: 'password_reset',
        consumed_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [['created_at', 'DESC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!otpRow || otpRow.attempts >= MAX_OTP_ATTEMPTS) {
      throw authError(INVALID_RESET);
    }
    if (!(await bcrypt.compare(otp, otpRow.otp_hash))) {
      await otpRow.increment('attempts', { transaction });
      await transaction.commit();
      throw authError(INVALID_RESET);
    }
    const jti = crypto.randomUUID();
    await otpRow.update({
      consumed_at: new Date(),
      session_jti_hash: hashValue(jti),
      session_expires_at: expiresAt(env.auth.sessionTtl),
    }, { transaction });
    await transaction.commit();
    return {
      resetToken: issueSessionToken({ subject: otpRow.id, purpose: 'password_reset', jti }),
      expiresIn: env.auth.sessionTtl,
    };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

export const resetPassword = async ({ resetToken, password }) => {
  const payload = verifySessionToken(resetToken, 'password_reset');
  const transaction = await sequelize.transaction();
  try {
    const otpRow = await EmailOtp.findByPk(payload.sub, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (
      !otpRow ||
      !otpRow.user_id ||
      otpRow.session_consumed_at ||
      !otpRow.session_expires_at ||
      new Date(otpRow.session_expires_at) <= new Date() ||
      otpRow.session_jti_hash !== hashValue(payload.jti)
    ) throw authError('Invalid or expired reset session.', 401);
    const user = await User.findOne({
      where: { userId: otpRow.user_id, ...activeUserWhere },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) throw authError('Invalid or expired reset session.', 401);
    await user.update({ password: await bcrypt.hash(password, SALT_ROUNDS) }, { transaction });
    await otpRow.update({ session_consumed_at: new Date(), session_jti_hash: null }, { transaction });
    await RefreshToken.update(
      { revoked_at: new Date() },
      { where: { user_id: user.userId, revoked_at: null }, transaction },
    );
    await transaction.commit();
    return { userId: user.userId };
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

export const refresh = async ({ refreshToken }, context) => {
  const transaction = await sequelize.transaction();
  try {
    const row = await RefreshToken.findOne({
      where: { token_hash: hashRefreshToken(refreshToken) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) throw authError('Invalid refresh token.', 401);
    if (row.revoked_at) {
      await RefreshToken.update(
        { revoked_at: new Date() },
        { where: { family_id: row.family_id, revoked_at: null }, transaction },
      );
      await transaction.commit();
      throw authError('Refresh token reuse detected.', 401);
    }
    if (new Date(row.expires_at) <= new Date()) throw authError('Invalid refresh token.', 401);
    const user = await User.findOne({
      where: { userId: row.user_id, ...activeUserWhere },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) throw authError('Invalid refresh token.', 401);
    const tokens = await createTokenPair(user, context, { familyId: row.family_id, transaction });
    await row.update({
      revoked_at: new Date(),
      replaced_by_id: tokens.refreshTokenRow.id,
    }, { transaction });
    await transaction.commit();
    delete tokens.refreshTokenRow;
    return tokens;
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

export const logout = async ({ refreshToken }) => {
  const row = await RefreshToken.findOne({
    where: { token_hash: hashRefreshToken(refreshToken) },
    attributes: ['id', 'user_id', 'revoked_at'],
  });
  if (row && !row.revoked_at) await row.update({ revoked_at: new Date() });
  return row?.user_id || null;
};

export const getProfile = (userId) => profileService.getMyProfile(userId);
export const updateProfile = (userId, data) => profileService.updateMyProfile(userId, data);

export const deleteAccount = async (userId, data) => {
  const result = await profileService.deleteAccount(userId, data);
  if (!result.error) {
    await RefreshToken.update(
      { revoked_at: new Date() },
      { where: { user_id: userId, revoked_at: null } },
    );
  }
  return result;
};
