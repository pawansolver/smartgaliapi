import { Op } from 'sequelize';
import ServiceProviderProfile from './service_provider_profile.model.js';
import User from '../user/user.model.js';
import ServiceCategory from '../service_category/service_category.model.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceBooking from '../service_booking/service_booking.model.js';
import { emitNotification } from '../notification/notification.service.js';
import { audit } from '../audit_log/audit_log.service.js';
import { logger } from '../../utils/logger.js';

export const getOrCreateProviderProfile = async (userId) => {
  let profile = await ServiceProviderProfile.findOne({
    where: { user_id: userId, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] },
      { model: ServiceCategory, as: 'category' },
    ],
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
      include: [
        { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] },
        { model: ServiceCategory, as: 'category' },
      ],
    });
  }

  return profile;
};

export const updateMyProfile = async (userId, updateData) => {
  const profile = await getOrCreateProviderProfile(userId);
  return await profile.update({ ...updateData, updatedAt: new Date() });
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
  if (verification_status && verification_status !== 'all') where.verification_status = verification_status;
  if (search) {
    where[Op.or] = [
      { business_name: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
    ];
  }

  const offset = (Number(page) - 1) * Number(limit);

  return await ServiceProviderProfile.findAndCountAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'phone', 'email'] },
      { model: ServiceCategory, as: 'category' },
    ],
    order: [['rating', 'DESC'], ['created_at', 'DESC']],
    limit: Number(limit),
    offset,
  });
};

export const getProfileById = async (id) => {
  return await ServiceProviderProfile.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName'] },
      { model: ServiceCategory, as: 'category' },
    ],
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
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] },
      { model: ServiceCategory, as: 'category' },
    ]
  });
};

export const verifyProfile = async (id, { is_verified, verification_status, remarks }, adminUserId) => {
  const profile = await ServiceProviderProfile.findOne({
    where: { id, is_deleted: false },
    include: [{ model: User, as: 'user', attributes: ['userId', 'userName'] }]
  });
  if (!profile) return null;

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
