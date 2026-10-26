import path from 'path';
import fs from 'fs';
import env from '../../config/env.js';
import { Op } from 'sequelize';
import ServiceProviderProfile from './service_provider_profile.model.js';
import ProviderDocument from './provider_document.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import ServiceCategory from '../service_category/service_category.model.js';
import KycDocumentType from '../service_category/kyc_document_type.model.js';
import CategoryDocumentRequirement from '../service_category/category_document_requirement.model.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceBooking from '../service_booking/service_booking.model.js';
import { emitNotification } from '../notification/notification.service.js';
import { audit } from '../audit_log/audit_log.service.js';
import { getImageUrl } from '../../utils/fileUpload.js';
import { logger } from '../../utils/logger.js';

export const providerDefaultInclude = [
  {
    model: User,
    as: 'user',
    attributes: ['userId', 'userName', 'email', 'phone', 'user_role', 'status'],
    include: [
      {
        model: UserProfile,
        as: 'profile',
        attributes: ['userProfileId', 'fullName', 'avatarUrl', 'bio', 'locationName'],
      },
    ],
  },
  {
    model: ServiceCategory,
    as: 'category',
    attributes: ['serviceCategoryId', 'serviceCategoryName', 'serviceCategoryImage'],
  },
];

export const getOrCreateProviderProfile = async (userId) => {
  let profile = await ServiceProviderProfile.findOne({
    where: { user_id: userId, is_deleted: false },
    include: providerDefaultInclude,
  });

  if (!profile) {
    const user = await User.findOne({ where: { userId, is_deleted: false } });
    profile = await ServiceProviderProfile.create({
      user_id: userId,
      business_name: user ? user.userName : 'Service Professional',
      provider_type: 'Independent Professional',
      rating: 0.00,
      review_count: 0,
      completed_jobs_count: 0,
      is_online: true,
      is_verified: false,
      verification_status: 'underReview',
      languages: [],
      service_area: {
        city: 'Patna',
        localities: ['Kankarbagh', 'Boring Road', 'Bailey Road'],
        pincodes: ['800020', '800001', '800014'],
        radiusKm: 15,
        centerLatitude: 25.5941,
        centerLongitude: 85.1376,
      },
      availability: {
        weeklySchedule: [
          { dayName: 'Monday', weekday: 1, isWorking: true, startTime: '09:00', endTime: '18:00' },
          { dayName: 'Tuesday', weekday: 2, isWorking: true, startTime: '09:00', endTime: '18:00' },
          { dayName: 'Wednesday', weekday: 3, isWorking: true, startTime: '09:00', endTime: '18:00' },
          { dayName: 'Thursday', weekday: 4, isWorking: true, startTime: '09:00', endTime: '18:00' },
          { dayName: 'Friday', weekday: 5, isWorking: true, startTime: '09:00', endTime: '18:00' },
          { dayName: 'Saturday', weekday: 6, isWorking: true, startTime: '10:00', endTime: '17:00' },
          { dayName: 'Sunday', weekday: 7, isWorking: false, startTime: '10:00', endTime: '14:00' },
        ],
        slotDurationMinutes: 90,
        bufferDurationMinutes: 30,
        maxConcurrentBookings: 1,
        exceptions: [],
      },
    });

    profile = await ServiceProviderProfile.findOne({
      where: { id: profile.id },
      include: providerDefaultInclude,
    });
  }

  return profile;
};

export const formatProviderProfileResponse = async (profile) => {
  if (!profile) return null;
  const docCount = await ProviderDocument.count({
    where: { provider_id: profile.id, is_deleted: false },
  });

  const plain = profile.toJSON ? profile.toJSON() : { ...profile };

  const providerName = plain.user?.profile?.fullName || plain.user?.userName || '';
  const profilePhoto = plain.user?.profile?.avatarUrl || null;
  const trade = plain.category?.serviceCategoryName || '';

  const autoAcceptBookings = Boolean(plain.auto_accept_bookings);
  const emergencyDispatch = plain.priority_emergency_dispatch !== undefined ? Boolean(plain.priority_emergency_dispatch) : true;
  const vacationMode = Boolean(plain.vacation_mode);
  const notificationPreferences = plain.notification_preferences || {
    notifBookings: true,
    notifStatusReminders: true,
    notifReviews: true,
    notifPayouts: true,
  };

  const normalizedProvider = {
    id: plain.id,
    userId: plain.user_id,
    name: providerName,
    profilePhoto,
    trade,
    categoryId: plain.service_category_id,
    isVerified: Boolean(plain.is_verified),
    verificationStatus: plain.verification_status,
    businessName: plain.business_name || '',
    serviceArea: plain.service_area,
    experience: plain.experience || '',
    languages: Array.isArray(plain.languages) ? plain.languages : [],
    phone: plain.user?.phone || '',
    email: plain.user?.email || '',
    autoAcceptBookings,
    emergencyDispatch,
    vacationMode,
    notificationPreferences,
  };

  return {
    ...plain,
    auto_accept_bookings: autoAcceptBookings,
    autoAcceptBookings,
    priority_emergency_dispatch: emergencyDispatch,
    emergencyDispatch,
    vacation_mode: vacationMode,
    vacationMode,
    notification_preferences: notificationPreferences,
    notificationPreferences,
    operationalPreferences: {
      autoAcceptBookings,
      emergencyDispatch,
      vacationMode,
    },
    fullName: providerName,
    avatarUrl: profilePhoto,
    provider: normalizedProvider,
    kyc: {
      status: plain.verification_status,
      isVerified: Boolean(plain.is_verified),
    },
    documents: {
      count: docCount,
    },
  };
};

export const updateMyProfile = async (userId, updateData) => {
  const profile = await getOrCreateProviderProfile(userId);
  const { fullName, ...profileFields } = updateData;

  if (fullName !== undefined) {
    let userProfile = await UserProfile.findOne({ where: { user_id: userId } });
    if (!userProfile) {
      await UserProfile.create({
        user_id: userId,
        fullName: fullName ? String(fullName).trim() : null,
        created_by: userId,
      });
    } else {
      await userProfile.update({
        fullName: fullName ? String(fullName).trim() : null,
        updated_by: userId,
        updatedAt: new Date(),
      });
    }
  }

  delete profileFields.is_verified;
  delete profileFields.verification_status;
  delete profileFields.service_category_id;
  delete profileFields.category_id;
  if (profileFields.businessName !== undefined) {
    if (profileFields.business_name === undefined) profileFields.business_name = profileFields.businessName;
    delete profileFields.businessName;
  }
  if (profileFields.experience !== undefined && profileFields.experience !== null) {
    profileFields.experience = String(profileFields.experience);
  }
  if (profileFields.autoAcceptBookings !== undefined && profileFields.auto_accept_bookings === undefined) {
    profileFields.auto_accept_bookings = Boolean(profileFields.autoAcceptBookings);
    delete profileFields.autoAcceptBookings;
  }
  if (profileFields.emergencyDispatch !== undefined && profileFields.priority_emergency_dispatch === undefined) {
    profileFields.priority_emergency_dispatch = Boolean(profileFields.emergencyDispatch);
    delete profileFields.emergencyDispatch;
  }
  if (profileFields.vacationMode !== undefined && profileFields.vacation_mode === undefined) {
    profileFields.vacation_mode = Boolean(profileFields.vacationMode);
    delete profileFields.vacationMode;
  }
  if (profileFields.notificationPreferences !== undefined && profileFields.notification_preferences === undefined) {
    profileFields.notification_preferences = profileFields.notificationPreferences;
    delete profileFields.notificationPreferences;
  }

  if (Object.keys(profileFields).length > 0) {
    await profile.update({ ...profileFields, updatedAt: new Date() });
  }

  return await getOrCreateProviderProfile(userId);
};

export const getMyServiceArea = async (userId) => {
  const profile = await getOrCreateProviderProfile(userId);
  return profile.service_area || {
    city: 'Patna',
    localities: ['Kankarbagh', 'Boring Road'],
    pincodes: ['800020', '800001'],
    radiusKm: 15,
    centerLatitude: 25.5941,
    centerLongitude: 85.1376,
  };
};

export const updateMyServiceArea = async (userId, areaData) => {
  const profile = await getOrCreateProviderProfile(userId);
  await profile.update({ service_area: areaData, updatedAt: new Date() });
  return profile.service_area;
};

export const getMyAvailability = async (userId) => {
  const profile = await getOrCreateProviderProfile(userId);
  return profile.availability || {
    weeklySchedule: [
      { dayName: 'Monday', weekday: 1, isWorking: true, startTime: '09:00', endTime: '18:00' },
      { dayName: 'Tuesday', weekday: 2, isWorking: true, startTime: '09:00', endTime: '18:00' },
      { dayName: 'Wednesday', weekday: 3, isWorking: true, startTime: '09:00', endTime: '18:00' },
      { dayName: 'Thursday', weekday: 4, isWorking: true, startTime: '09:00', endTime: '18:00' },
      { dayName: 'Friday', weekday: 5, isWorking: true, startTime: '09:00', endTime: '18:00' },
      { dayName: 'Saturday', weekday: 6, isWorking: true, startTime: '10:00', endTime: '17:00' },
      { dayName: 'Sunday', weekday: 7, isWorking: false, startTime: '10:00', endTime: '14:00' },
    ],
    slotDurationMinutes: 90,
    bufferDurationMinutes: 30,
    maxConcurrentBookings: 1,
    exceptions: [],
  };
};

export const updateMyAvailability = async (userId, availabilityData) => {
  const profile = await getOrCreateProviderProfile(userId);
  await profile.update({ availability: availabilityData, updatedAt: new Date() });
  return profile.availability;
};

export const getMyOverviewStats = async (userId) => {
  const profile = await getOrCreateProviderProfile(userId);

  const totalServices = await ServiceListing.count({
    where: { provider_id: profile.id, is_deleted: false },
  });

  const bookings = await ServiceBooking.findAll({
    where: { provider_id: profile.id, is_deleted: false },
    attributes: ['id', 'status', 'amount'],
  });

  let pendingBookings = 0;
  let upcomingBookings = 0;
  let completedBookings = 0;
  let earnings = 0.0;

  for (const b of bookings) {
    const s = String(b.status || '').toLowerCase();
    if (s === 'pending' || s === 'requested') {
      pendingBookings++;
    } else if (s === 'confirmed' || s === 'accepted' || s === 'scheduled' || s === 'on_the_way' || s === 'started' || s === 'in_progress') {
      upcomingBookings++;
    } else if (s === 'completed') {
      completedBookings++;
      earnings += (Number(b.amount) || 0.0);
    }
  }

  return {
    totalServices,
    pendingBookings,
    upcomingBookings,
    completedBookings,
    rating: Number(profile.rating || 0.0),
    earnings: Math.round(earnings * 100) / 100,
  };
};

export const getMyEarnings = async (userId) => {
  const profile = await getOrCreateProviderProfile(userId);
  const completedBookings = await ServiceBooking.findAll({
    where: { provider_id: profile.id, status: 'completed', is_deleted: false },
    attributes: ['id', 'booking_reference', 'amount', 'scheduled_at', 'completed_at', 'price_snapshot'],
    order: [['completed_at', 'DESC']],
  });

  const totalEarnings = completedBookings.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  return {
    totalEarnings: Math.round(totalEarnings * 100) / 100,
    completedJobs: completedBookings.length,
    recentPayouts: completedBookings.slice(0, 20),
  };
};

export const getAllProfiles = async ({ category_id, is_verified, is_online, search, page = 1, limit = 20 } = {}) => {
  const where = { is_deleted: false };
  if (category_id) where.service_category_id = category_id;
  if (is_verified !== undefined) where.is_verified = is_verified;
  if (is_online !== undefined) where.is_online = is_online;
  if (search) {
    where[Op.or] = [
      { business_name: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
    ];
  }

  const offset = (Number(page) - 1) * Number(limit);

  return await ServiceProviderProfile.findAndCountAll({
    where,
    include: providerDefaultInclude,
    order: [['rating', 'DESC'], ['created_at', 'DESC']],
    limit: Number(limit),
    offset,
  });
};

export const getProfileById = async (id) => {
  return await ServiceProviderProfile.findOne({
    where: { id, is_deleted: false },
    include: providerDefaultInclude,
  });
};

export const updateProfile = async (id, updateData) => {
  const profile = await ServiceProviderProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteProfile = async (id, deletedRemarks, updated_by) => {
  const profile = await ServiceProviderProfile.findOne({ where: { id, is_deleted: false } });
  if (!profile) return null;
  return await profile.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteProfiles = async (ids, deletedRemarks, updated_by) => {
  return await ServiceProviderProfile.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};

export const getPendingVerifications = async () => {
  return await ServiceProviderProfile.findAll({
    where: {
      is_deleted: false,
      verification_status: { [Op.in]: ['underReview', 'actionRequired'] }
    },
    include: providerDefaultInclude,
  });
};

export const verifyProfile = async (id, { is_verified, verification_status, remarks }, adminUserId) => {
  const profile = await ServiceProviderProfile.findOne({
    where: { id, is_deleted: false },
    include: providerDefaultInclude,
  });
  if (!profile) return null;

  // Strict Server-Side Verification Gate when setting is_verified = true or status = 'verified'
  if (is_verified || verification_status === 'verified') {
    if (!profile.service_category_id) {
      const error = new Error('Cannot verify provider: No trade category registered on profile.');
      error.statusCode = 400;
      throw error;
    }

    const category = await ServiceCategory.findOne({
      where: { serviceCategoryId: profile.service_category_id, is_deleted: false },
    });
    if (!category) {
      const error = new Error('Cannot verify provider: Registered service category not found.');
      error.statusCode = 400;
      throw error;
    }

    if (!category.kyc_configured) {
      const error = new Error(`Cannot verify provider: Category '${category.serviceCategoryName}' KYC requirements have not been configured by admin.`);
      error.statusCode = 400;
      error.errorCode = 'KYC_REQUIREMENTS_NOT_CONFIGURED';
      throw error;
    }

    const check = await getRequiredDocuments(profile.user_id);
    if (!check.summary.is_kyc_complete) {
      const missing = check.summary.mandatory - check.summary.satisfied_mandatory;
      const error = new Error(
        `Cannot approve provider: Mandatory KYC requirements not satisfied (${missing} missing/unverified, ${check.summary.pending} pending review, ${check.summary.rejected} rejected).`
      );
      error.statusCode = 400;
      error.errorCode = 'MANDATORY_DOCUMENTS_MISSING';
      error.data = check.summary;
      throw error;
    }
  }

  const previousStatus = profile.verification_status;
  await profile.update({
    is_verified,
    verification_status,
    remark: remarks || profile.remark,
    updated_by: adminUserId,
    updatedAt: new Date(),
  });

  await audit({
    actorId: adminUserId,
    action: 'PROVIDER_VERIFICATION_UPDATED',
    targetType: 'service_provider_profile',
    targetId: profile.id,
    before: { verification_status: previousStatus },
    after: { is_verified, verification_status, remarks },
  });

  // Notify provider
  if (profile.user_id) {
    const title = is_verified ? 'Provider Verification Approved!' : 'Verification Status Updated';
    const msg = is_verified
      ? 'Congratulations! Your SmartGali Service Provider account is now verified.'
      : `Your verification status was updated to: ${verification_status}.${remarks ? ' Reason: ' + remarks : ''}`;

    await emitNotification({
      recipientId: profile.user_id,
      actorId: adminUserId,
      type: 'provider_verified',
      title,
      message: msg,
      data: { target: 'provider_verification', providerId: profile.id, status: verification_status },
      preferenceKey: 'booking_requests',
      sendPush: true,
    });
  }

  return profile;
};

// â”€â”€ Provider Documents (KYC) Services â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const getMyDocuments = async (userId) => {
  const profile = await getOrCreateProviderProfile(userId);
  return await ProviderDocument.findAll({
    where: { provider_id: profile.id, is_deleted: false },
    attributes: [
      'id', 'provider_id', 'user_id', 'document_type', 'title',
      'file_url', 'file_type', 'file_size', 'status',
      'rejection_reason', 'verified_at', 'created_at', 'updatedAt'
    ],
    order: [['created_at', 'DESC']],
  });
};

export const uploadMyDocument = async (userId, arg2, arg3 = {}) => {
  let file, body;
  if (arg2 && (arg2.mimetype || arg2.size || arg2.path || arg2.buffer)) {
    file = arg2;
    body = arg3 || {};
  } else {
    body = arg2 || {};
    file = arg3 || {};
  }
  const profile = await getOrCreateProviderProfile(userId);
  const fileUrl = getImageUrl(null, file, 'provider-documents');

  let docTypeId = (body.document_type_id || body.documentTypeId) ? parseInt(body.document_type_id || body.documentTypeId, 10) : null;
  let docTypeCode = (body.document_type || body.documentType) ? String(body.document_type || body.documentType).trim().toLowerCase() : null;

  // Validate against database master kyc_document_types
  let masterDocType = null;
  if (docTypeId) {
    masterDocType = await KycDocumentType.findOne({
      where: { id: docTypeId, is_deleted: false, is_active: true },
    });
  } else if (docTypeCode) {
    masterDocType = await KycDocumentType.findOne({
      where: { code: docTypeCode, is_deleted: false, is_active: true },
    });
  } else {
    masterDocType = await KycDocumentType.findOne({
      where: { code: 'other', is_deleted: false, is_active: true },
    });
  }

  if (!masterDocType) {
    const error = new Error(`Invalid or inactive document type: '${docTypeCode || docTypeId}'`);
    error.statusCode = 400;
    throw error;
  }

  // Check file constraints
  if (masterDocType.max_file_size_bytes && file.size > masterDocType.max_file_size_bytes) {
    const error = new Error(`File exceeds maximum allowed size of ${Math.round(masterDocType.max_file_size_bytes / (1024 * 1024))}MB`);
    error.statusCode = 400;
    throw error;
  }

  const effectiveDocNumber = (body.document_number || body.documentNumber) ? String(body.document_number || body.documentNumber).trim() : null;
  const effectiveExpiry = body.expiry_date || body.expiryDate || null;
  const effectiveIssue = body.issue_date || body.issueDate || null;

  if (masterDocType.requires_expiry) {
    if (!effectiveExpiry) {
      const error = new Error(`Expiry date is required for document type '${masterDocType.name}'`);
      error.statusCode = 400;
      throw error;
    }
    const exp = new Date(effectiveExpiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(exp.getTime()) || exp < today) {
      const error = new Error('Document expiry date cannot be in the past');
      error.statusCode = 400;
      throw error;
    }
  }

  const doc = await ProviderDocument.create({
    provider_id: profile.id,
    user_id: userId,
    document_type: masterDocType.code,
    document_type_id: masterDocType.id,
    title: body.title || file.originalname || masterDocType.name,
    document_number: effectiveDocNumber,
    expiry_date: effectiveExpiry,
    issue_date: effectiveIssue,
    file_url: fileUrl,
    file_type: file.mimetype,
    file_size: file.size,
    status: 'under_review',
    created_by: userId,
  });

  if (profile.verification_status === 'notSubmitted' || profile.verification_status === 'actionRequired') {
    await profile.update({ verification_status: 'underReview', updatedAt: new Date() });
  }

  return doc;
};

export const deleteMyDocument = async (userId, documentId) => {
  const profile = await getOrCreateProviderProfile(userId);
  const doc = await ProviderDocument.findOne({
    where: { id: documentId, provider_id: profile.id, is_deleted: false },
  });
  if (!doc) return null;

  await doc.update({ is_deleted: true, updated_by: userId, updatedAt: new Date() });
  return true;
};

export const verifyProviderDocument = async (documentId, { status, rejection_reason }, adminUserId) => {
  const doc = await ProviderDocument.findOne({
    where: { id: documentId, is_deleted: false },
  });
  if (!doc) return null;

  const previousStatus = doc.status;
  await doc.update({
    status,
    rejection_reason: rejection_reason || null,
    verified_by: adminUserId,
    verified_at: new Date(),
    updated_by: adminUserId,
    updatedAt: new Date(),
  });

  await audit({
    actorId: adminUserId,
    action: 'PROVIDER_DOCUMENT_VERIFIED',
    targetType: 'provider_document',
    targetId: doc.id,
    before: { status: previousStatus },
    after: { status, rejection_reason },
  });

  // Notify provider
  await emitNotification({
    recipientId: doc.user_id,
    actorId: adminUserId,
    type: 'document_verification',
    title: status === 'verified' ? 'Document Verified' : 'Document Rejected',
    message: status === 'verified'
      ? `Your document (${doc.document_type}) has been approved.`
      : `Your document (${doc.document_type}) was rejected.${rejection_reason ? ' Reason: ' + rejection_reason : ''}`,
    data: { target: 'provider_document', documentId: doc.id, status },
    preferenceKey: 'booking_requests',
    sendPush: true,
  });

  return doc;
};


export const getRequiredDocuments = async (userId) => {
  const profile = await getOrCreateProviderProfile(userId);
  if (!profile.service_category_id) {
    return {
      is_configured: false,
      configuration_message: 'Provider has not registered a trade category yet.',
      category: null,
      summary: { total: 0, mandatory: 0, satisfied_mandatory: 0, pending: 0, rejected: 0, is_kyc_complete: false },
      checklist: [],
    };
  }

  const category = await ServiceCategory.findOne({
    where: { serviceCategoryId: profile.service_category_id, is_deleted: false },
  });

  if (!category) {
    return {
      is_configured: false,
      configuration_message: 'Category assigned to provider not found.',
      category: null,
      summary: { total: 0, mandatory: 0, satisfied_mandatory: 0, pending: 0, rejected: 0, is_kyc_complete: false },
      checklist: [],
    };
  }

  // Fetch active requirements for this category
  const requirements = await CategoryDocumentRequirement.findAll({
    where: {
      service_category_id: profile.service_category_id,
      is_active: true,
      is_deleted: false,
      [Op.or]: [
        { applicable_provider_type: null },
        { applicable_provider_type: profile.provider_type },
      ],
    },
    include: [{ model: KycDocumentType, as: 'documentType', where: { is_deleted: false } }],
    order: [['is_mandatory', 'DESC'], ['id', 'ASC']],
  });

  // Fetch provider's active uploaded documents
  const documents = await ProviderDocument.findAll({
    where: { provider_id: profile.id, is_deleted: false },
    order: [['created_at', 'DESC']],
  });

  const today = new Date().toISOString().split('T')[0];

  let mandatoryCount = 0;
  let satisfiedMandatoryCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  const checklist = requirements.map((req) => {
    const docType = req.documentType;
    if (req.is_mandatory) mandatoryCount++;

    const matchingDocs = documents.filter(
      (d) => (d.document_type_id && Number(d.document_type_id) === Number(docType.id)) ||
             (d.document_type && d.document_type === docType.code)
    );

    const doc = matchingDocs[0] || null;

    let uploadStatus = 'not_uploaded';
    let reviewStatus = 'not_uploaded';
    let isSatisfied = false;
    let isExpired = false;

    if (doc) {
      uploadStatus = 'uploaded';
      reviewStatus = doc.status;
      if (doc.status === 'under_review') pendingCount++;
      if (doc.status === 'rejected') rejectedCount++;

      if (doc.expiry_date) {
        const todayStr = new Date().toISOString().split('T')[0];
        const expStr = new Date(doc.expiry_date).toISOString().split('T')[0];
        if (expStr < todayStr) {
          isExpired = true;
          reviewStatus = 'expired';
        }
      }

      if (doc.status === 'verified' && !isExpired) {
        isSatisfied = true;
        if (req.is_mandatory) satisfiedMandatoryCount++;
      }
    }

    return {
      requirement_id: req.id,
      document_type_id: docType.id,
      code: docType.code,
      name: docType.name,
      description: docType.description,
      is_mandatory: req.is_mandatory,
      requires_expiry: docType.requires_expiry,
      allowed_mime_types: docType.allowed_mime_types,
      upload_status: uploadStatus,
      review_status: reviewStatus,
      is_satisfied: isSatisfied,
      is_expired: isExpired,
      document_id: doc ? doc.id : null,
      file_url: doc ? doc.file_url : null,
      document_number: doc ? doc.document_number : null,
      expiry_date: doc ? doc.expiry_date : null,
      issue_date: doc ? doc.issue_date : null,
      rejection_reason: doc ? doc.rejection_reason : null,
      verified_at: doc ? doc.verified_at : null,
      updatedAt: doc ? doc.updatedAt : null,
    };
  });

  const isConfigured = Boolean(category.kyc_configured);
  const isKycComplete = isConfigured && (mandatoryCount === 0 || satisfiedMandatoryCount === mandatoryCount);

  return {
    is_configured: isConfigured,
    configuration_message: isConfigured
      ? (mandatoryCount === 0 ? 'Category has zero additional mandatory requirements policy.' : 'Requirements active.')
      : 'Category KYC requirements have not been configured by admin yet.',
    category: {
      id: category.serviceCategoryId,
      name: category.serviceCategoryName,
      kyc_configured: isConfigured,
    },
    summary: {
      total: requirements.length,
      mandatory: mandatoryCount,
      satisfied_mandatory: satisfiedMandatoryCount,
      pending: pendingCount,
      rejected: rejectedCount,
      is_kyc_complete: isKycComplete,
    },
    checklist,
  };
};

export const getProviderDocumentsForAdmin = async (providerId) => {
  const profile = await ServiceProviderProfile.findOne({
    where: { id: providerId, is_deleted: false },
    include: providerDefaultInclude,
  });
  if (!profile) return null;

  const docs = await ProviderDocument.findAll({
    where: { provider_id: profile.id, is_deleted: false },
    include: [
      {
        model: KycDocumentType,
        as: 'masterDocumentType',
        attributes: ['id', 'code', 'name', 'requires_expiry', 'allowed_mime_types'],
      },
    ],
    order: [['created_at', 'DESC']],
  });

  const check = profile.user_id ? await getRequiredDocuments(profile.user_id) : null;

  return {
    provider: {
      id: profile.id,
      user_id: profile.user_id,
      business_name: profile.business_name,
      provider_type: profile.provider_type,
      is_verified: profile.is_verified,
      verification_status: profile.verification_status,
      category_id: profile.service_category_id,
      category_name: profile.category?.serviceCategoryName || null,
    },
    documents: docs.map((d) => d.toJSON()),
    requirements_summary: check?.summary || null,
    checklist: check?.checklist || [],
  };
};

export const getProviderDocumentFile = async (documentId, userId, isAdmin) => {
  const doc = await ProviderDocument.findOne({
    where: { id: documentId, is_deleted: false },
  });
  if (!doc) {
    const error = new Error('KYC Document not found.');
    error.statusCode = 404;
    throw error;
  }
  if (!isAdmin && Number(doc.user_id) !== Number(userId)) {
    const error = new Error('Access denied: You do not have permission to access this document.');
    error.statusCode = 403;
    throw error;
  }
  const filename = path.basename(doc.file_url);
  const filePath = path.join(env.uploadsPath, 'provider-documents', filename);
  if (!fs.existsSync(filePath)) {
    const error = new Error('Document file not found on storage server.');
    error.statusCode = 404;
    throw error;
  }
  return { filePath, filename, doc };
};


export const getMyOperationalPreferences = async (userId) => {
  const profile = await getOrCreateProviderProfile(userId);
  const plain = profile.toJSON ? profile.toJSON() : { ...profile };
  const autoAcceptBookings = Boolean(plain.auto_accept_bookings);
  const emergencyDispatch = plain.priority_emergency_dispatch !== undefined ? Boolean(plain.priority_emergency_dispatch) : true;
  const vacationMode = Boolean(plain.vacation_mode);
  const notificationPreferences = plain.notification_preferences || {
    notifBookings: true,
    notifStatusReminders: true,
    notifReviews: true,
    notifPayouts: true,
  };

  return {
    auto_accept_bookings: autoAcceptBookings,
    autoAcceptBookings,
    priority_emergency_dispatch: emergencyDispatch,
    emergencyDispatch,
    vacation_mode: vacationMode,
    vacationMode,
    notification_preferences: notificationPreferences,
    notificationPreferences,
  };
};

export const updateMyOperationalPreferences = async (userId, prefsData) => {
  const profile = await getOrCreateProviderProfile(userId);
  const plain = profile.toJSON ? profile.toJSON() : { ...profile };
  const updates = {};
  if (prefsData.auto_accept_bookings !== undefined) updates.auto_accept_bookings = Boolean(prefsData.auto_accept_bookings);
  if (prefsData.autoAcceptBookings !== undefined) updates.auto_accept_bookings = Boolean(prefsData.autoAcceptBookings);
  if (prefsData.priority_emergency_dispatch !== undefined) updates.priority_emergency_dispatch = Boolean(prefsData.priority_emergency_dispatch);
  if (prefsData.emergencyDispatch !== undefined) updates.priority_emergency_dispatch = Boolean(prefsData.emergencyDispatch);
  if (prefsData.vacation_mode !== undefined) updates.vacation_mode = Boolean(prefsData.vacation_mode);
  if (prefsData.vacationMode !== undefined) updates.vacation_mode = Boolean(prefsData.vacationMode);
  const currentPrefs = plain.notification_preferences || {};
  const incomingPrefs = prefsData.notificationPreferences || prefsData.notification_preferences;
  if (incomingPrefs && typeof incomingPrefs === 'object') {
    updates.notification_preferences = {
      ...currentPrefs,
      ...incomingPrefs,
    };
  } else if (incomingPrefs !== undefined) {
    updates.notification_preferences = incomingPrefs;
  }

  updates.updatedAt = new Date();
  await profile.update(updates);
  return getMyOperationalPreferences(userId);
};


export const getMyNotificationPreferences = async (userId) => {
  const profile = await getOrCreateProviderProfile(userId);
  const plain = profile.toJSON ? profile.toJSON() : { ...profile };
  const prefs = plain.notification_preferences || {};

  const notifBookings = prefs.notifBookings !== undefined ? Boolean(prefs.notifBookings) : (prefs.newBookingRequests !== undefined ? Boolean(prefs.newBookingRequests) : true);
  const notifStatusReminders = prefs.notifStatusReminders !== undefined ? Boolean(prefs.notifStatusReminders) : (prefs.jobReminders !== undefined ? Boolean(prefs.jobReminders) : true);
  const notifReviews = prefs.notifReviews !== undefined ? Boolean(prefs.notifReviews) : (prefs.customerReviews !== undefined ? Boolean(prefs.customerReviews) : true);
  const notifPayouts = prefs.notifPayouts !== undefined ? Boolean(prefs.notifPayouts) : (prefs.settlementsPayouts !== undefined ? Boolean(prefs.settlementsPayouts) : true);

  return {
    notifBookings,
    newBookingRequests: notifBookings,
    notifStatusReminders,
    jobReminders: notifStatusReminders,
    notifReviews,
    customerReviews: notifReviews,
    notifPayouts,
    settlementsPayouts: notifPayouts,
  };
};

export const updateMyNotificationPreferences = async (userId, notifData) => {
  const profile = await getOrCreateProviderProfile(userId);
  const plain = profile.toJSON ? profile.toJSON() : { ...profile };
  const current = plain.notification_preferences || {};

  const updatedPrefs = {
    notifBookings: current.notifBookings !== undefined ? current.notifBookings : (current.newBookingRequests !== undefined ? current.newBookingRequests : true),
    notifStatusReminders: current.notifStatusReminders !== undefined ? current.notifStatusReminders : (current.jobReminders !== undefined ? current.jobReminders : true),
    notifReviews: current.notifReviews !== undefined ? current.notifReviews : (current.customerReviews !== undefined ? current.customerReviews : true),
    notifPayouts: current.notifPayouts !== undefined ? current.notifPayouts : (current.settlementsPayouts !== undefined ? current.settlementsPayouts : true),
  };

  if (notifData.notifBookings !== undefined) updatedPrefs.notifBookings = Boolean(notifData.notifBookings);
  if (notifData.newBookingRequests !== undefined) updatedPrefs.notifBookings = Boolean(notifData.newBookingRequests);
  if (notifData.notif_bookings !== undefined) updatedPrefs.notifBookings = Boolean(notifData.notif_bookings);

  if (notifData.notifStatusReminders !== undefined) updatedPrefs.notifStatusReminders = Boolean(notifData.notifStatusReminders);
  if (notifData.jobReminders !== undefined) updatedPrefs.notifStatusReminders = Boolean(notifData.jobReminders);
  if (notifData.notif_status_reminders !== undefined) updatedPrefs.notifStatusReminders = Boolean(notifData.notif_status_reminders);

  if (notifData.notifReviews !== undefined) updatedPrefs.notifReviews = Boolean(notifData.notifReviews);
  if (notifData.customerReviews !== undefined) updatedPrefs.notifReviews = Boolean(notifData.customerReviews);
  if (notifData.notif_reviews !== undefined) updatedPrefs.notifReviews = Boolean(notifData.notif_reviews);

  if (notifData.notifPayouts !== undefined) updatedPrefs.notifPayouts = Boolean(notifData.notifPayouts);
  if (notifData.settlementsPayouts !== undefined) updatedPrefs.notifPayouts = Boolean(notifData.settlementsPayouts);
  if (notifData.notif_payouts !== undefined) updatedPrefs.notifPayouts = Boolean(notifData.notif_payouts);

  await profile.update({
    notification_preferences: updatedPrefs,
    updatedAt: new Date(),
  });

  // Optional: keep NotificationPreference row synchronized if present
  try {
    const NotificationPreference = (await import('../profile/notification_preference.model.js')).default;
    await NotificationPreference.update(
      { booking_requests: updatedPrefs.notifBookings, updatedAt: new Date() },
      { where: { user_id: userId } }
    );
  } catch (_) {}

  return getMyNotificationPreferences(userId);
};
