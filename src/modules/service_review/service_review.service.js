import ServiceReview from './service_review.model.js';
import ServiceBooking from '../service_booking/service_booking.model.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import User from '../user/user.model.js';
import { emitNotification } from '../notification/notification.service.js';
import { logger } from '../../utils/logger.js';

export const createReview = async (reviewData) => {
  const review = await ServiceReview.create(reviewData);

  // Asynchronously notify provider of new customer review
  (async () => {
    try {
      const booking = await ServiceBooking.findOne({
        where: { id: review.booking_id, is_deleted: false },
        include: [{
          model: ServiceListing,
          as: 'listing',
          include: [{
            model: ServiceProviderProfile,
            as: 'provider',
            attributes: ['id', 'user_id'],
          }],
        }],
      });
      const providerUserId = booking?.listing?.provider?.user_id;
      if (providerUserId) {
        await emitNotification({
          recipientId: providerUserId,
          actorId: review.user_id,
          type: 'service_review',
          title: 'New Service Review',
          message: `You received a ${review.rating}-star review for "${booking.listing?.title || 'your service'}".`,
          data: { target: 'review', bookingId: Number(booking.id), reviewId: Number(review.id) },
          preferenceKey: 'booking_requests',
          sendPush: true,
        });
      }
    } catch (err) {
      logger.error('REVIEW_NOTIF_ERROR', err.message);
    }
  })();

  return review;
};

export const getAllReviews = async () => {
  return await ServiceReview.findAll({
    where: { is_deleted: false },
    include: [
      { model: ServiceBooking, as: 'booking', attributes: ['id', 'status', 'amount'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'profile_image'] }
    ]
  });
};

export const getReviewById = async (id) => {
  return await ServiceReview.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: ServiceBooking, as: 'booking', attributes: ['id', 'status', 'amount'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'profile_image'] }
    ]
  });
};

export const updateReview = async (id, updateData) => {
  const review = await ServiceReview.findOne({ where: { id, is_deleted: false } });
  if (!review) return null;
  return await review.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteReview = async (id, deletedRemarks, updated_by) => {
  const review = await ServiceReview.findOne({ where: { id, is_deleted: false } });
  if (!review) return null;
  return await review.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteReviews = async (ids, deletedRemarks, updated_by) => {
  return await ServiceReview.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
