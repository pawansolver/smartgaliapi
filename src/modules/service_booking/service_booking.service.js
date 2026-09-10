import ServiceBooking from './service_booking.model.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import User from '../user/user.model.js';
import { emitNotification } from '../notification/notification.service.js';
import { logger } from '../../utils/logger.js';

export const createBooking = async (bookingData) => {
  const booking = await ServiceBooking.create(bookingData);

  // Asynchronously notify provider of new booking request
  (async () => {
    try {
      const listing = await ServiceListing.findOne({
        where: { id: booking.listing_id, is_deleted: false },
        include: [{
          model: ServiceProviderProfile,
          as: 'provider',
          attributes: ['id', 'user_id'],
        }],
      });
      if (listing?.provider?.user_id) {
        await emitNotification({
          recipientId: listing.provider.user_id,
          actorId: booking.user_id,
          type: 'booking_request',
          title: 'New Booking Request',
          message: `You received a new booking request for "${listing.title}".`,
          data: { target: 'booking', bookingId: Number(booking.id), isProvider: true },
          preferenceKey: 'booking_requests',
          sendPush: true,
        });
      }
    } catch (err) {
      logger.error('BOOKING_NOTIF_ERROR', err.message);
    }
  })();

  return booking;
};

export const getAllBookings = async () => {
  return await ServiceBooking.findAll({
    where: { is_deleted: false },
    include: [
      { model: ServiceListing, as: 'listing', attributes: ['id', 'title', 'price'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const getBookingById = async (id) => {
  return await ServiceBooking.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: ServiceListing, as: 'listing', attributes: ['id', 'title', 'price'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'] }
    ]
  });
};

export const updateBooking = async (id, updateData) => {
  const booking = await ServiceBooking.findOne({
    where: { id, is_deleted: false },
    include: [{ model: ServiceListing, as: 'listing', attributes: ['id', 'title'] }]
  });
  if (!booking) return null;
  const previousStatus = booking.status;
  const updated = await booking.update({ ...updateData, updatedAt: new Date() });

  if (updateData.status && updateData.status !== previousStatus) {
    (async () => {
      try {
        const listingTitle = booking.listing?.title || 'Service';
        if (updateData.status === 'confirmed') {
          await emitNotification({
            recipientId: booking.user_id,
            type: 'booking_accepted',
            title: 'Booking Accepted',
            message: `Your booking for "${listingTitle}" has been accepted.`,
            data: { target: 'booking', bookingId: Number(booking.id), isProvider: false },
            preferenceKey: 'booking_requests',
            sendPush: true,
          });
        } else if (updateData.status === 'cancelled') {
          await emitNotification({
            recipientId: booking.user_id,
            type: 'booking_rejected',
            title: 'Booking Cancelled',
            message: `Booking #${booking.id} for "${listingTitle}" was cancelled.`,
            data: { target: 'booking', bookingId: Number(booking.id), isProvider: false },
            preferenceKey: 'booking_requests',
            sendPush: true,
          });
        } else if (updateData.status === 'completed') {
          await emitNotification({
            recipientId: booking.user_id,
            type: 'booking_completed',
            title: 'Booking Completed',
            message: `Your booking for "${listingTitle}" is completed. Tap to rate your experience.`,
            data: { target: 'booking', bookingId: Number(booking.id), isProvider: false },
            preferenceKey: 'booking_requests',
            sendPush: true,
          });
        }
      } catch (err) {
        logger.error('BOOKING_UPDATE_NOTIF_ERROR', err.message);
      }
    })();
  }

  return updated;
};

export const softDeleteBooking = async (id, deletedRemarks, updated_by) => {
  const booking = await ServiceBooking.findOne({ where: { id, is_deleted: false } });
  if (!booking) return null;
  return await booking.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteBookings = async (ids, deletedRemarks, updated_by) => {
  return await ServiceBooking.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
