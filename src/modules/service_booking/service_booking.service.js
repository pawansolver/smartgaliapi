import SocietyMember from '../society_member/society_member.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import { calculateAuthoritativeServicePrice } from '../service_listing/service_pricing.service.js';
import { resolveServiceDurationConfig, parseTimeSlotInterval } from './service_duration.service.js';
import { validateCustomerCoverageEligibility } from './service_coverage.service.js';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import ServiceBooking from './service_booking.model.js';
import ServiceBookingTimeline from './service_booking_timeline.model.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import User from '../user/user.model.js';
import { emitNotification } from '../notification/notification.service.js';
import { getIO } from '../../socket.js';
import { audit } from '../audit_log/audit_log.service.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';
import { logger } from '../../utils/logger.js';

/**
 * Creates a new booking with concurrency protection and doorstep safety PIN.
 */
export const createBooking = async (bookingData, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;

  // Execute inside a database transaction to prevent race conditions & double-booking
  return await sequelize.transaction(async (t) => {
    const listing = await ServiceListing.findOne({
      where: { id: bookingData.listing_id, is_deleted: false },
      include: [
        {
          model: ServiceProviderProfile,
          as: 'provider',
          where: { is_deleted: false },
          include: [{ model: User, as: 'user', attributes: ['userId', 'userName'] }],
        },
      ],
      transaction: t,
      lock: t.LOCK.SHARE,
    });

    if (!listing) {
      const err = new Error('Service listing not found or inactive');
      err.statusCode = 404;
      throw err;
    }

    if (!listing.is_available || listing.moderation_status !== 'approved') {
      const err = new Error('This service is currently unavailable for bookings');
      err.statusCode = 400;
      throw err;
    }

    const providerId = listing.provider_id || listing.provider?.id;
    if (!providerId) {
      const err = new Error('Service listing does not have an assigned provider');
      err.statusCode = 400;
      throw err;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // AUTHORITATIVE COVERAGE ENGINE (Step 4 & Flow Enforcement)
    // Provider -> Service -> Coverage -> Society / Public -> Customer Location -> Coverage Engine
    // Decision: YES -> Allow Booking | NO -> Block (HTTP 409 Conflict)
    // ──────────────────────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────────────────
    // AUTHORITATIVE RESIDENT SOCIETY RESOLUTION (Phases 8 & 19)
    // Prevent resident from spoofing an arbitrary society_id
    // ──────────────────────────────────────────────────────────────────────────
    let authoritativeSocietyId = null;
    if (bookingData.society_id) {
      const targetSocId = Number(bookingData.society_id);
      const membership = await SocietyMember.findOne({
        where: {
          user_id: actorId,
          society_id: targetSocId,
          status: 'active',
          is_deleted: false,
        },
        transaction: t,
      });

      if (!membership) {
        // Also check if caller is society creator/owner
        const society = await SocietyProfile.findOne({
          where: { id: targetSocId, is_deleted: false, is_active: true },
          transaction: t,
        });
        const isOwner = society && (Number(society.user_id) === Number(actorId) || Number(society.created_by) === Number(actorId));
        if (!isOwner) {
          const err = new Error('Security Violation: You do not have an active membership in the specified residential society.');
          err.statusCode = 403;
          err.code = 'INVALID_SOCIETY_MEMBERSHIP';
          throw err;
        }
      }
      authoritativeSocietyId = targetSocId;
    } else if (listing.coverage_scope === 'SOCIETY') {
      const activeMember = await SocietyMember.findOne({
        where: {
          user_id: actorId,
          status: 'active',
          is_deleted: false,
        },
        order: [['id', 'DESC']],
        transaction: t,
      });
      if (activeMember) {
        authoritativeSocietyId = Number(activeMember.society_id);
      }
    }

    if (!listing.provider?.is_active) {
      const err = new Error('The designated service provider is currently inactive.');
      err.statusCode = 400;
      throw err;
    }

    const coverageResult = await validateCustomerCoverageEligibility({
      listing,
      providerProfile: listing.provider,
      customerLocation: {
        latitude: bookingData.latitude,
        longitude: bookingData.longitude,
        society_id: authoritativeSocietyId,
        service_address: bookingData.service_address,
        locality: bookingData.locality,
        pincode: bookingData.pincode,
        city: bookingData.city,
        locality_id: bookingData.locality_id,
        pincode_id: bookingData.pincode_id,
        city_id: bookingData.city_id,
      },
      userRole: actorUser?.userRole || actorUser?.role || 'resident',
    });

    if (!coverageResult.isEligible) {
      const err = new Error(coverageResult.reason || 'This service is not available in your area.');
      err.statusCode = 409;
      err.code = coverageResult.reasonCode || 'OUT_OF_SERVICE_AREA';
      throw err;
    }

    // Resolve authoritative Step 3 Duration, Buffer, Execution & Capacity configuration
    const durationConfig = await resolveServiceDurationConfig(listing);
    const bookingInterval = parseTimeSlotInterval(
      bookingData.scheduled_at,
      bookingData.time_slot,
      durationConfig.totalOccupancyMinutes
    );

    const scheduledDateStart = new Date(bookingInterval.start || bookingData.scheduled_at);
    const occupiedUntilDate = new Date(bookingInterval.occupiedUntil || (scheduledDateStart.getTime() + durationConfig.totalOccupancyMinutes * 60000));

    // Determine effective booking capacity: service listing configuration takes priority, then provider profile fallback
    const effectiveCapacity = durationConfig.capacity || listing.provider?.availability?.maxConcurrentBookings || 1;

    // Check concurrency & interval overlap:
    // Existing active bookings overlap with new interval if:
    // (existing.scheduled_at < new.occupied_until) AND (existing.occupied_until > new.scheduled_at)
    // Or if exact same time_slot string on same scheduled_at date
    const existingActiveBookings = await ServiceBooking.findAll({
      where: {
        provider_id: providerId,
        status: { [Op.in]: ['requested', 'pending', 'accepted', 'confirmed', 'scheduled', 'on_the_way', 'started', 'in_progress'] },
        is_deleted: false,
        [Op.or]: [
          {
            // Exact same date & time slot
            scheduled_at: bookingData.scheduled_at,
            time_slot: bookingData.time_slot,
          },
          {
            // Interval overlap check where occupied_until exists
            [Op.and]: [
              { scheduled_at: { [Op.lt]: occupiedUntilDate } },
              { occupied_until: { [Op.gt]: scheduledDateStart } },
            ],
          },
        ],
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (existingActiveBookings.length >= effectiveCapacity) {
      const err = new Error('This time slot is no longer available due to existing booking occupancy. Please choose another time slot.');
      err.statusCode = 409;
      throw err;
    }

    // Generate secure 4-digit doorstep PIN and unique reference
    const doorstepPin = String(Math.floor(1000 + Math.random() * 9000));
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const bookingReference = `SG-SRV-${randomSuffix}`;

    // Authoritative Price Calculation for Booking
    const priceCalculation = await calculateAuthoritativeServicePrice({
      listingId: listing.id,
      packageId: bookingData.package_id || null,
      addonIds: bookingData.addon_ids || [],
      durationHours: bookingData.duration_hours || 1,
      materialCharge: bookingData.material_charge || 0.00,
      discountAmount: bookingData.discount_amount || 0.00,
    });

    const coverageSnapshot = {
      society_id: authoritativeSocietyId || null,
      provider_id: providerId,
      service_listing_id: listing.id,
      society_access_id: coverageResult.societyAccessId || null,
      access_status_at_booking: coverageResult.societyAccessStatus || (authoritativeSocietyId ? 'APPROVED' : null),
      coverage_area_id: coverageResult.matchedCoverageAreaId || null,
      coverage_method: coverageResult.coverageMethod || 'RADIUS',
      coverage_scope: coverageResult.coverageScope || listing.coverage_scope || 'PUBLIC',
      distance_km: coverageResult.distanceKm != null ? coverageResult.distanceKm : null,
      allowed_radius_km: coverageResult.allowedRadiusKm != null ? coverageResult.allowedRadiusKm : null,
      city_id: bookingData.city_id || null,
      locality_id: bookingData.locality_id || null,
      pincode_id: bookingData.pincode_id || null,
      evaluated_at: new Date().toISOString(),
    };

    const priceSnapshot = {
      selected_package_name: bookingData.package_name || null,
      selected_package_price: bookingData.package_price || null,
      selected_addon_names: bookingData.selected_addon_names || [],
      platform_fee: bookingData.platform_fee || 29.00,
      gst_amount: bookingData.gst_amount || 0.00,
      material_charge: bookingData.material_charge || 50.00,
      final_amount_charged: (bookingData.amount != null && Number(bookingData.amount) > 0) ? Number(bookingData.amount) : priceCalculation.customer_payable,
      ...priceCalculation,
      category_id: listing.category_id,
      provider_id: providerId,
      provider_name: listing.provider?.user?.userName || listing.provider?.business_name || 'Service Professional',
      duration_minutes: durationConfig.durationMinutes,
      duration_label: durationConfig.durationLabel,
      buffer_minutes: durationConfig.bufferMinutes,
      buffer_label: durationConfig.bufferLabel,
      execution_method: durationConfig.executionMethodCode,
      total_occupancy_minutes: durationConfig.totalOccupancyMinutes,
      distance_km: coverageResult.distanceKm != null ? coverageResult.distanceKm : null,
      coverage_area_type: coverageResult.coverageMethod || coverageResult.coverage?.areaTypeCode || 'RADIUS',
      coverage_snapshot: coverageSnapshot,
    };

    const booking = await ServiceBooking.create({
      coverage_snapshot: coverageSnapshot,
      listing_id: listing.id,
      provider_id: providerId,
      user_id: actorId,
      booking_reference: bookingReference,
      scheduled_at: scheduledDateStart,
      occupied_until: occupiedUntilDate,
      time_slot: bookingData.time_slot,
      service_address: bookingData.service_address,
      society_id: authoritativeSocietyId || null,
      latitude: bookingData.latitude || null,
      longitude: bookingData.longitude || null,
      notes: bookingData.notes || null,
      status: 'requested',
      amount: (bookingData.amount != null && Number(bookingData.amount) > 0) ? Number(bookingData.amount) : priceCalculation.customer_payable,
      doorstep_pin: doorstepPin,
      doorstep_pin_verified: false,
      price_snapshot: priceSnapshot,
      created_by: actorId,
    }, { transaction: t });

    // Initial timeline entry
    await ServiceBookingTimeline.create({
      booking_id: booking.id,
      status: 'requested',
      actor_id: actorId,
      actor_role: 'resident',
      notes: 'Booking requested by resident.',
    }, { transaction: t });

    // Increment bookings count on listing
    await listing.increment('bookings_count', { by: 1, transaction: t });

    // Asynchronously notify provider of new request
    setImmediate(async () => {
      try {
        if (listing.provider?.user_id) {
          await emitNotification({
            recipientId: listing.provider.user_id,
            actorId,
            type: 'booking_request',
            title: 'New Service Booking Request',
            message: `You received a new booking request for "${listing.title}".`,
            data: { target: 'booking', bookingId: Number(booking.id), isProvider: true },
            preferenceKey: 'booking_requests',
            sendPush: true,
          });

          const io = getIO();
          if (io) {
            io.to(`user_${listing.provider.user_id}`).emit('booking_request', {
              bookingId: booking.id,
              serviceTitle: listing.title,
              timeSlot: booking.time_slot,
            });
          }
        }
      } catch (notifErr) {
        logger.error('BOOKING_CREATE_NOTIF', notifErr.message);
      }
    });

    return booking;
  });
};

export const getBookingById = async (id) => {
  return await ServiceBooking.findOne({
    where: { id, is_deleted: false },
    include: [
      {
        model: ServiceListing,
        as: 'listing',
        include: [
          {
            model: ServiceProviderProfile,
            as: 'provider',
            include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'phone', 'email'] }],
          },
        ],
      },
      {
        model: ServiceProviderProfile,
        as: 'provider',
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'phone', 'email'] }],
      },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'phone', 'email'] },
      { model: ServiceBookingTimeline, as: 'timelines' },
    ],
    order: [[{ model: ServiceBookingTimeline, as: 'timelines' }, 'created_at', 'ASC']],
  });
};

export const getMyResidentBookings = async (userId, statusFilter) => {
  const where = { user_id: userId, is_deleted: false };
  if (statusFilter) {
    const s = statusFilter.toLowerCase().trim();
    if (s === 'upcoming') {
      where.status = { [Op.in]: ['requested', 'pending', 'accepted', 'confirmed', 'scheduled', 'on_the_way', 'started', 'in_progress'] };
    } else if (s === 'completed') {
      where.status = 'completed';
    } else if (s === 'cancelled') {
      where.status = { [Op.in]: ['cancelled', 'rejected', 'declined'] };
    } else if (s !== 'all') {
      where.status = s;
    }
  }

  return await ServiceBooking.findAll({
    where,
    include: [
      {
        model: ServiceListing,
        as: 'listing',
        include: [
          {
            model: ServiceProviderProfile,
            as: 'provider',
            include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'phone'] }],
          },
        ],
      },
      {
        model: ServiceProviderProfile,
        as: 'provider',
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'phone'] }],
      },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'phone'] },
    ],
    order: [['created_at', 'DESC']],
  });
};

export const getProviderBookings = async (userId, { statusFilter, isRequestsOnly = false } = {}) => {
  const profile = await ServiceProviderProfile.findOne({ where: { user_id: userId, is_deleted: false } });
  if (!profile) return [];

  const where = { provider_id: profile.id, is_deleted: false };
  if (isRequestsOnly) {
    where.status = { [Op.in]: ['requested', 'pending'] };
  } else if (statusFilter) {
    const s = statusFilter.toLowerCase().trim();
    if (s === 'upcoming') {
      where.status = { [Op.in]: ['accepted', 'confirmed', 'scheduled', 'on_the_way', 'started', 'in_progress'] };
    } else if (s === 'completed') {
      where.status = 'completed';
    } else if (s === 'cancelled') {
      where.status = { [Op.in]: ['cancelled', 'rejected', 'declined'] };
    } else if (s !== 'all') {
      where.status = s;
    }
  }

  return await ServiceBooking.findAll({
    where,
    include: [
      { model: ServiceListing, as: 'listing' },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'phone', 'email'] },
    ],
    order: [['created_at', 'DESC']],
  });
};

export const getAdminAllBookings = async ({ page = 1, limit = 50, status } = {}) => {
  const where = { is_deleted: false };
  if (status) where.status = status;
  const offset = (Number(page) - 1) * Number(limit);

  return await ServiceBooking.findAndCountAll({
    where,
    include: [
      { model: ServiceListing, as: 'listing' },
      {
        model: ServiceProviderProfile,
        as: 'provider',
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'phone'] }],
      },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'phone'] },
    ],
    order: [['created_at', 'DESC']],
    limit: Number(limit),
    offset,
  });
};

/**
 * Authoritative Booking State Machine Transition Engine
 */
export const transitionBooking = async (id, action, params = {}, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = isGlobalAdminUser(actorUser);

  const booking = await getBookingById(id);
  if (!booking) {
    const err = new Error('Booking not found');
    err.statusCode = 404;
    throw err;
  }

  const isResidentOwner = booking.user_id === actorId;
  const isProviderOwner = booking.provider?.user_id === actorId || booking.listing?.provider?.user_id === actorId;
  const currentStatus = String(booking.status || '').toLowerCase();
  const listingTitle = booking.listing?.title || 'Service';

  let nextStatus = null;
  let timelineNote = null;
  let actorRole = isAdmin ? 'admin' : (isProviderOwner ? 'provider' : 'resident');

  switch (action) {
    case 'accept': {
      if (!isProviderOwner && !isAdmin) {
        const err = new Error('Forbidden: Only the assigned service provider can accept booking requests');
        err.statusCode = 403;
        throw err;
      }
      if (currentStatus !== 'requested' && currentStatus !== 'pending') {
        const err = new Error(`Cannot accept booking from status '${currentStatus}'`);
        err.statusCode = 400;
        throw err;
      }
      nextStatus = 'accepted';
      timelineNote = 'Booking accepted by service professional.';
      break;
    }

    case 'reject': {
      if (!isProviderOwner && !isAdmin) {
        const err = new Error('Forbidden: Only the assigned service provider can reject booking requests');
        err.statusCode = 403;
        throw err;
      }
      if (currentStatus !== 'requested' && currentStatus !== 'pending') {
        const err = new Error(`Cannot reject booking from status '${currentStatus}'`);
        err.statusCode = 400;
        throw err;
      }
      nextStatus = 'rejected';
      timelineNote = `Booking rejected by provider. Reason: ${params.reason || params.rejection_reason || 'Unavailable'}`;
      break;
    }

    case 'schedule': {
      if (!isProviderOwner && !isAdmin) {
        const err = new Error('Forbidden: Only the assigned service provider can schedule this service');
        err.statusCode = 403;
        throw err;
      }

      // Revalidate Duration & Buffer Occupancy for Rescheduling / Scheduling
      const newScheduledAt = params.scheduled_at || booking.scheduled_at;
      const newTimeSlot = params.time_slot || booking.time_slot;
      const durationConfig = await resolveServiceDurationConfig(booking.listing || booking.listing_id);
      const bookingInterval = parseTimeSlotInterval(newScheduledAt, newTimeSlot, durationConfig.totalOccupancyMinutes);
      const scheduledDateStart = new Date(bookingInterval.start || newScheduledAt);
      const occupiedUntilDate = new Date(bookingInterval.occupiedUntil || (scheduledDateStart.getTime() + durationConfig.totalOccupancyMinutes * 60000));
      const effectiveCapacity = durationConfig.capacity || booking.provider?.availability?.maxConcurrentBookings || 1;

      // Check for overlapping bookings (excluding current booking)
      const conflictingBookings = await ServiceBooking.findAll({
        where: {
          id: { [Op.ne]: booking.id },
          provider_id: booking.provider_id,
          status: { [Op.in]: ['requested', 'pending', 'accepted', 'confirmed', 'scheduled', 'on_the_way', 'started', 'in_progress'] },
          is_deleted: false,
          [Op.or]: [
            {
              scheduled_at: newScheduledAt,
              time_slot: newTimeSlot,
            },
            {
              [Op.and]: [
                { scheduled_at: { [Op.lt]: occupiedUntilDate } },
                { occupied_until: { [Op.gt]: scheduledDateStart } },
              ],
            },
          ],
        },
      });

      if (conflictingBookings.length >= effectiveCapacity) {
        const err = new Error('The requested reschedule time slot is no longer available due to existing booking occupancy.');
        err.statusCode = 409;
        throw err;
      }

      params._computed_scheduled_start = scheduledDateStart;
      params._computed_occupied_until = occupiedUntilDate;
      nextStatus = 'scheduled';
      timelineNote = `Service scheduled for ${newScheduledAt} (${newTimeSlot}). Total occupancy: ${durationConfig.totalOccupancyMinutes} mins.`;
      break;
    }

    case 'on_the_way': {
      if (!isProviderOwner && !isAdmin) {
        const err = new Error('Forbidden: Only the assigned service provider can update arrival status');
        err.statusCode = 403;
        throw err;
      }
      if (!['accepted', 'confirmed', 'scheduled'].includes(currentStatus)) {
        const err = new Error(`Cannot transition to 'on_the_way' from status '${currentStatus}'`);
        err.statusCode = 400;
        throw err;
      }
      nextStatus = 'on_the_way';
      timelineNote = 'Service technician is on the way to resident location. Doorstep PIN ready.';
      break;
    }

    case 'start': {
      if (!isProviderOwner && !isAdmin) {
        const err = new Error('Forbidden: Only the assigned service provider can start this service');
        err.statusCode = 403;
        throw err;
      }
      if (!['on_the_way', 'accepted', 'confirmed', 'scheduled'].includes(currentStatus)) {
        const err = new Error(`Cannot start service from status '${currentStatus}'`);
        err.statusCode = 400;
        throw err;
      }

      // CRITICAL SECURITY: Verify Doorstep 4-digit Safety PIN
      const submittedPin = String(params.doorstep_pin || '').trim();
      const actualPin = String(booking.doorstep_pin || '').trim();

      if (!submittedPin || submittedPin !== actualPin) {
        const err = new Error('Invalid Doorstep Safety PIN. Please ask the resident for the 4-digit PIN displayed on their booking screen.');
        err.statusCode = 400;
        throw err;
      }

      nextStatus = 'started';
      timelineNote = 'Doorstep Safety PIN successfully verified. Service started.';
      break;
    }

    case 'complete': {
      if (!isProviderOwner && !isAdmin) {
        const err = new Error('Forbidden: Only the assigned service provider can complete this service');
        err.statusCode = 403;
        throw err;
      }
      if (!['started', 'in_progress', 'on_the_way'].includes(currentStatus)) {
        const err = new Error(`Cannot complete service from status '${currentStatus}'`);
        err.statusCode = 400;
        throw err;
      }
      nextStatus = 'completed';
      timelineNote = 'Service completed successfully by provider.';
      break;
    }

    case 'cancel': {
      if (!isResidentOwner && !isProviderOwner && !isAdmin) {
        const err = new Error('Forbidden: You are not authorized to cancel this booking');
        err.statusCode = 403;
        throw err;
      }
      if (['on_the_way', 'started', 'in_progress', 'completed'].includes(currentStatus) && !isAdmin) {
        const err = new Error(`Cannot cancel booking once provider is in transit or service started (current status: '${currentStatus}')`);
        err.statusCode = 400;
        throw err;
      }
      nextStatus = 'cancelled';
      timelineNote = `Booking cancelled by ${actorRole}. Reason: ${params.reason || params.cancellation_reason || 'Not specified'}`;
      break;
    }

    default: {
      const err = new Error(`Unknown booking transition action '${action}'`);
      err.statusCode = 400;
      throw err;
    }
  }

  // Update booking record
  const updateFields = {
    status: nextStatus,
    updated_by: actorId,
    updatedAt: new Date(),
  };

  if (action === 'start') {
    updateFields.doorstep_pin_verified = true;
    updateFields.started_at = new Date();
  }
  if (action === 'complete') {
    updateFields.completed_at = new Date();
  }
  if (action === 'reject' && (params.reason || params.rejection_reason)) {
    updateFields.rejection_reason = params.reason || params.rejection_reason;
  }
  if (action === 'cancel' && (params.reason || params.cancellation_reason)) {
    updateFields.cancellation_reason = params.reason || params.cancellation_reason;
  }
  if (action === 'schedule') {
    if (params.scheduled_at) updateFields.scheduled_at = params._computed_scheduled_start || params.scheduled_at;
    if (params.time_slot) updateFields.time_slot = params.time_slot;
    if (params._computed_occupied_until) updateFields.occupied_until = params._computed_occupied_until;
  }

  await booking.update(updateFields);

  // If completed, increment provider completed_jobs_count
  if (nextStatus === 'completed' && booking.provider_id) {
    await ServiceProviderProfile.increment('completed_jobs_count', {
      by: 1,
      where: { id: booking.provider_id },
    });
  }

  // Append timeline record
  await ServiceBookingTimeline.create({
    booking_id: booking.id,
    status: nextStatus,
    actor_id: actorId,
    actor_role: actorRole,
    notes: timelineNote,
  });

  // Audit log
  await audit({
    actorId,
    action: `BOOKING_STATUS_${nextStatus.toUpperCase()}`,
    targetType: 'service_booking',
    targetId: booking.id,
    before: { status: currentStatus },
    after: { status: nextStatus },
  });

  // Realtime & Notifications
  setImmediate(async () => {
    try {
      const io = getIO();
      // Notify resident
      if (booking.user_id && isProviderOwner) {
        let title = 'Booking Status Update';
        let msg = `Your booking for "${listingTitle}" is now ${nextStatus}.`;

        if (nextStatus === 'accepted') {
          title = 'Booking Accepted';
          msg = `Your booking for "${listingTitle}" has been accepted.`;
        } else if (nextStatus === 'rejected') {
          title = 'Booking Rejected';
          msg = `Your booking for "${listingTitle}" was rejected. Reason: ${booking.rejection_reason || 'Unavailable'}`;
        } else if (nextStatus === 'on_the_way') {
          title = 'Technician On The Way';
          msg = 'Your service professional is on the way! Doorstep PIN is ready in your booking screen.';
        } else if (nextStatus === 'started') {
          title = 'Service In Progress';
          msg = 'Doorstep PIN verified. Service is now in progress!';
        } else if (nextStatus === 'completed') {
          title = 'Service Completed';
          msg = `Your service for "${listingTitle}" is completed. Tap to rate your experience.`;
        }

        await emitNotification({
          recipientId: booking.user_id,
          actorId,
          type: `booking_${nextStatus}`,
          title,
          message: msg,
          data: { target: 'booking', bookingId: Number(booking.id), status: nextStatus, isProvider: false },
          preferenceKey: 'booking_requests',
          sendPush: true,
        });

        if (io) {
          io.to(`user_${booking.user_id}`).emit('booking_status_change', {
            bookingId: booking.id,
            status: nextStatus,
          });
        }
      }

      // Notify provider if resident cancelled
      if (isResidentOwner && nextStatus === 'cancelled' && booking.provider?.user_id) {
        await emitNotification({
          recipientId: booking.provider.user_id,
          actorId,
          type: 'booking_cancelled',
          title: 'Booking Cancelled by Resident',
          message: `Booking #${booking.id} for "${listingTitle}" was cancelled.`,
          data: { target: 'booking', bookingId: Number(booking.id), status: 'cancelled', isProvider: true },
          preferenceKey: 'booking_requests',
          sendPush: true,
        });

        if (io) {
          io.to(`user_${booking.provider.user_id}`).emit('booking_status_change', {
            bookingId: booking.id,
            status: 'cancelled',
          });
        }
      }
    } catch (notifErr) {
      logger.error('BOOKING_TRANSITION_NOTIF', notifErr.message);
    }
  });

  return await getBookingById(booking.id);
};

export const getBookingTimelines = async (bookingId) => {
  return await ServiceBookingTimeline.findAll({
    where: { booking_id: bookingId },
    order: [['created_at', 'ASC']],
  });
};

export const softDeleteBooking = async (id, deletedRemarks, updated_by) => {
  const booking = await ServiceBooking.findOne({ where: { id, is_deleted: false } });
  if (!booking) return null;
  return await booking.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};


export const getAvailableSlots = async (listingId, targetDate) => {
  const { getAvailableSlotsForDate } = await import('./service_duration.service.js');
  return await getAvailableSlotsForDate(listingId, targetDate);
};
