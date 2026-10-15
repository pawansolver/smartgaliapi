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

    // Check concurrency: Ensure no overlapping active booking for the exact date & time slot
    const activeBookingCount = await ServiceBooking.count({
      where: {
        provider_id: providerId,
        scheduled_at: bookingData.scheduled_at,
        time_slot: bookingData.time_slot,
        status: { [Op.in]: ['requested', 'pending', 'accepted', 'confirmed', 'scheduled', 'on_the_way', 'started', 'in_progress'] },
        is_deleted: false,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const maxAllowed = listing.provider?.availability?.maxConcurrentBookings || 1;
    if (activeBookingCount >= maxAllowed) {
      const err = new Error('This time slot is no longer available. Please choose another time slot.');
      err.statusCode = 409;
      throw err;
    }

    // Generate secure 4-digit doorstep PIN and unique reference
    const doorstepPin = String(Math.floor(1000 + Math.random() * 9000));
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const bookingReference = `SG-SRV-${randomSuffix}`;

    // Snapshot price and service details to ensure historical immutability
    const priceSnapshot = {
      listing_id: listing.id,
      title: listing.title,
      price: listing.price != null ? Number(listing.price) : 0,
      duration: listing.duration || null,
      category_id: listing.category_id,
      provider_id: providerId,
      provider_name: listing.provider?.user?.userName || listing.provider?.business_name || 'Service Professional',
    };

    const booking = await ServiceBooking.create({
      listing_id: listing.id,
      provider_id: providerId,
      user_id: actorId,
      booking_reference: bookingReference,
      scheduled_at: bookingData.scheduled_at,
      time_slot: bookingData.time_slot,
      service_address: bookingData.service_address,
      notes: bookingData.notes || null,
      status: 'requested',
      amount: listing.price,
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
      nextStatus = 'scheduled';
      timelineNote = `Service scheduled for ${params.scheduled_at || booking.scheduled_at} (${params.time_slot || booking.time_slot}).`;
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
    if (params.scheduled_at) updateFields.scheduled_at = params.scheduled_at;
    if (params.time_slot) updateFields.time_slot = params.time_slot;
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
