import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { successResponse, errorResponse } from '../../utils/response.js';
import User from '../user/user.model.js';
import env from '../../config/env.js';
import { sendOtpEmail } from '../../utils/emailService.js';
import sequelize from '../../config/db.js';
import UserProfile from './userProfile.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import { uploadImage, getImageUrl } from '../../utils/fileUpload.js';


// ═══════════════════════════════════════════════════════════════
// HYBRID OTP LOGIN FLOW  (Phone OR Email → OTP via Email only)
// ═══════════════════════════════════════════════════════════════

/**
 * Detects whether a given identifier string is an email or a phone number.
 * @param {string} identifier
 * @returns {'email' | 'phone'}
 */
const detectIdentifierType = (identifier) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(identifier) ? 'email' : 'phone';
};

const isUnavailableUser = (user) =>
  user.is_deleted || user.is_active === false || user.status !== 'active';

/**
 * POST /api/v1/user-profile/send-otp
 *
 * Accepts:
 *   { identity: "9876543210" }   ← phone number (will look up associated email)
 *   { identity: "user@mail.com" } ← email directly
 *
 * Flow:
 *   1. Detect identity type (email / phone)
 *   2. Find or create user record
 *   3. If phone: fetch the user's email; return error if none is linked yet
 *   4. Generate 6-digit OTP, hash it, save it with 5-min expiry
 *   5. Dispatch OTP via Nodemailer to user's email — NO SMS cost
 */
export const sendOTP = async (req, res, next) => {
  try {
    const { phoneNumber, email } = req.body;

    if (!phoneNumber || !email || !phoneNumber.trim() || !email.trim()) {
      return errorResponse(res, 400, 'Both phone number and email are required.');
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPhone = phoneNumber.trim();

    const [user] = await User.findOrCreate({
      where: { email: cleanEmail },
      defaults: {
        email: cleanEmail,
        phone: cleanPhone,
        userRole: 'resident',
        userName: `user_${cleanEmail.split('@')[0]}`,
      },
    });

    if (isUnavailableUser(user)) {
      return errorResponse(res, 403, 'This account is inactive or unavailable.');
    }

    // ── Check if User is Blocked from requesting OTP ──────────────
    if (user.otpBlockedUntil && new Date(user.otpBlockedUntil).getTime() > Date.now()) {
      const waitMins = Math.ceil((new Date(user.otpBlockedUntil).getTime() - Date.now()) / 60000);
      return errorResponse(res, 403, `Too many attempts. You are blocked for ${waitMins} more minutes.`);
    }

    // ── Reset counts if block has expired OR > 1 hour since last OTP ──
    let resendCount = user.otpResendCount || 0;
    let blockedUntil = user.otpBlockedUntil;
    if (user.otpSentAt) {
      const hoursSinceLastOtp = (Date.now() - new Date(user.otpSentAt).getTime()) / 3600000;
      if (hoursSinceLastOtp > 1) {
        resendCount = 0;
        blockedUntil = null;
      }
    }

    // ── Generate OTP ──────────────────────────────────────────────
    const rawOtp =
      process.env.NODE_ENV === 'development'
        ? '123456'
        : String(crypto.randomInt(100000, 999999));

    // ── Hash OTP (bcrypt, saltRounds = 10) ───────────────────────
    const saltRounds = 10;
    const hashedOtp = await bcrypt.hash(rawOtp, saltRounds);
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // +5 minutes

    await user.update({
      phone: cleanPhone,
      currentOtp: hashedOtp,
      otpExpiresAt: otpExpiry,
      otpSentAt: new Date(),
      otpResendCount: resendCount,       // persist the reset (or unchanged) count
      otpBlockedUntil: blockedUntil,     // persist the reset (or unchanged) block
    });

    // ── Dispatch OTP via Email (Nodemailer) ───────────────────────
    await sendOtpEmail(cleanEmail, rawOtp);

    return successResponse(res, 200, 'OTP dispatched to your registered email address.', {
      email: cleanEmail,
      channel: 'email',
      expiresAt: otpExpiry,
      // NEVER expose OTP in production; shown here only for local dev
      ...(process.env.NODE_ENV === 'development' && { devOtp: rawOtp, devEmail: cleanEmail }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/user-profile/resend-otp
 * Flow:
 * 1. Find existing user
 * 2. Enterprise Rate Limiting: Prevent resend if < 30 seconds elapsed
 * 3. Generate, hash, and dispatch new OTP
 */
export const resendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return errorResponse(res, 400, 'Email is required to resend OTP.');
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ where: { email: cleanEmail } });

    if (!user) {
      return errorResponse(res, 404, 'User not found. Please request an initial OTP first.');
    }

    if (isUnavailableUser(user)) {
      return errorResponse(res, 403, 'This account is inactive or unavailable.');
    }

    // ── Check if User is Blocked ──────────────────────────────────
    if (user.otpBlockedUntil && new Date(user.otpBlockedUntil).getTime() > Date.now()) {
      const waitMins = Math.ceil((new Date(user.otpBlockedUntil).getTime() - Date.now()) / 60000);
      return errorResponse(res, 403, `Too many attempts. You are blocked for ${waitMins} more minutes.`);
    }

    // ── Reset counts if > 1 hour since last OTP (persisted) ──────
    let resendCount = user.otpResendCount || 0;
    let blockedUntil = user.otpBlockedUntil;
    if (user.otpSentAt) {
      const hoursSinceLastOtp = (Date.now() - new Date(user.otpSentAt).getTime()) / 3600000;
      if (hoursSinceLastOtp > 1) {
        resendCount = 0;
        blockedUntil = null;
      }
    }

    // ── 30-second cooldown check ───────────────────────────────────
    if (user.otpSentAt) {
      const secondsSinceLastOtp = (Date.now() - new Date(user.otpSentAt).getTime()) / 1000;
      if (secondsSinceLastOtp < 30) {
        const waitSeconds = Math.ceil(30 - secondsSinceLastOtp);
        return errorResponse(res, 429, `Please wait ${waitSeconds} more seconds before requesting a new OTP.`);
      }
    }

    // ── Max 3 Resends Per Hour: increment first, block on 4th ─────
    // (1st, 2nd, 3rd resend → success; 4th attempt → blocked for 1 hour)
    const newResendCount = resendCount + 1;
    if (newResendCount > 3) {
      const blockUntil = new Date(Date.now() + 60 * 60 * 1000); // Block for 1 hour
      await user.update({ otpBlockedUntil: blockUntil, otpResendCount: newResendCount });
      return errorResponse(res, 429, 'Maximum OTP resend limit reached (3/hr). Try again in 1 hour.');
    }

    // ── Generate & Hash New OTP ───────────────────────────────────
    const rawOtp =
      process.env.NODE_ENV === 'development'
        ? '123456'
        : String(crypto.randomInt(100000, 999999));
    const hashedOtp = await bcrypt.hash(rawOtp, 10);
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    await user.update({
      currentOtp: hashedOtp,
      otpExpiresAt: otpExpiry,
      otpSentAt: new Date(),
      otpResendCount: newResendCount,  // always save correct count to DB
      otpBlockedUntil: blockedUntil,
    });

    await sendOtpEmail(cleanEmail, rawOtp);

    return successResponse(res, 200, 'A new OTP has been successfully dispatched to your email.', {
      email: cleanEmail,
      expiresAt: otpExpiry,
      ...(process.env.NODE_ENV === 'development' && { devOtp: rawOtp }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/user-profile/verify-otp
 *
 * Accepts:
 *   { identity: "9876543210" | "user@mail.com", otp: "123456" }
 *
 * Flow:
 *   1. Detect identity type, resolve correct user record
 *   2. Check OTP expiry window
 *   3. bcrypt.compare OTP against stored hash
 *   4. Mark user verified, nullify OTP fields, issue 30-day JWT
 */
export const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return errorResponse(res, 400, 'Both email and otp are required.');
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ where: { email: cleanEmail } });

    if (!user) {
      const err = new Error('User not found. Please request an OTP first.');
      err.statusCode = 404;
      return next(err);
    }

    if (isUnavailableUser(user)) {
      return errorResponse(res, 403, 'This account is inactive or unavailable.');
    }

    // ── Check expiry ──────────────────────────────────────────────
    if (!user.currentOtp || !user.otpExpiresAt || new Date() > new Date(user.otpExpiresAt)) {
      const err = new Error('OTP has expired. Please request a new OTP.');
      err.statusCode = 400;
      return next(err);
    }

    // ── Verify OTP (bcrypt compare) ───────────────────────────────
    const isMatch = await bcrypt.compare(otp, user.currentOtp);
    if (!isMatch) {
      const err = new Error('Invalid OTP. Please try again.');
      err.statusCode = 400;
      return next(err);
    }

    // ── OTP valid: update user record ─────────────────────────────
    await user.update({
      is_verified: true,
      currentOtp: null,
      otpExpiresAt: null,
    });

    // ── Generate JWT (30 days) ────────────────────────────────────
    const accessToken = jwt.sign(
      {
        id: user.userId,
        role: user.userRole || 'resident',
        email: user.email,
        phone: user.phone,
      },
      env.jwt.secret,
      { expiresIn: '30d' }
    );

    return successResponse(res, 200, 'OTP verified successfully. Login successful.', {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: '30d',
      user: {
        id: user.userId,
        email: user.email,
        phone: user.phone,
        role: user.userRole || 'resident',
      },
    });
  } catch (error) {
    next(error);
  }
};


/**
 * PUT /api/v1/user-profile/complete-setup
 * Universal Profile Setup Controller Engine
 */
export const completeProfileSetup = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { role, fullName, latitude, longitude, businessName, operatingHours, bannerUrl, serviceCategory, hourlyRate, availabilityDays } = req.body;
    const userId = req.user.id;

    if (!role || !['resident', 'shopkeeper', 'provider'].includes(role)) {
      await t.rollback();
      return errorResponse(res, 400, "Invalid or missing role.");
    }

    // Step 1: Core User Update (UserProfile)
    let userProfile = await UserProfile.findOne({ where: { user_id: userId }, transaction: t });
    if (!userProfile) {
      await UserProfile.create({
        user_id: userId,
        fullName,
        latitude,
        longitude,
        isProfileComplete: true
      }, { transaction: t });
    } else {
      await userProfile.update({
        fullName,
        latitude,
        longitude,
        isProfileComplete: true
      }, { transaction: t });
    }

    // Update role and basic info in User table as well
    await User.update({ 
      userRole: role,
      userName: fullName,
      latitude,
      longitude 
    }, { where: { userId }, transaction: t });

    // Step 2: Conditional Role Execution
    if (role === 'shopkeeper') {
      const businessData = {
        userId,
        businessName,
        operatingHours,
        bannerUrl
      };

      const existingBusiness = await BusinessProfile.findOne({ where: { userId }, transaction: t });
      if (existingBusiness) {
        await existingBusiness.update(businessData, { transaction: t });
      } else {
        await BusinessProfile.create(businessData, { transaction: t });
      }
    } else if (role === 'provider') {
      const providerData = {
        userId,
        serviceCategory,
        hourlyRate,
        availabilityDays
      };

      const existingBusiness = await BusinessProfile.findOne({ where: { userId }, transaction: t });
      if (existingBusiness) {
        await existingBusiness.update(providerData, { transaction: t });
      } else {
        await BusinessProfile.create(providerData, { transaction: t });
      }
    }

    await t.commit();
    return successResponse(res, 200, "Profile setup completed successfully.");
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

/**
 * POST /api/v1/user-profile/upload-banner
 * Upload shop/provider banner image via multer.
 * Returns the hosted URL to save in BusinessProfile.bannerUrl.
 */
export const uploadBanner = [
  // multer middleware: accepts single file with field name 'banner'
  uploadImage('banners').single('banner'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return errorResponse(res, 400, "No image file provided. Send as multipart/form-data with field name 'banner'.");
      }
      const bannerUrl = getImageUrl(req, req.file, 'banners');
      return successResponse(res, 200, 'Banner uploaded successfully.', { bannerUrl });
    } catch (error) {
      next(error);
    }
  }
];

