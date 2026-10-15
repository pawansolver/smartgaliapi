import sequelize from '../../config/db.js';
import ServiceReview from './service_review.model.js';
import ServiceBooking from '../service_booking/service_booking.model.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import User from '../user/user.model.js';
import { emitNotification } from '../notification/notification.service.js';
import { audit } from '../audit_log/audit_log.service.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';
import { logger } from '../../utils/logger.js';

export const createReview = async ({ booking_id, rating, comment }, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;

  return await sequelize.transaction(async (t) => {
    const booking = await ServiceBooking.findOne({
      where: { id: booking_id, is_deleted: false },
      include: [{ model: ServiceListing, as: 'listing' }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!booking) {
      const err = new Error('Booking not found');
      err.statusCode = 404;
      throw err;
    }

    if (booking.user_id !== actorId) {
      const err = new Error('Forbidden: You can only review your own booking');
      err.statusCode = 403;
      throw err;
    }

    if (String(booking.status || '').toLowerCase() !== 'completed') {
      const err = new Error('Only completed services can be reviewed');
      err.statusCode = 400;
      throw err;
    }

    // Duplicate review prevention
    const existingReview = await ServiceReview.findOne({
      where: { booking_id, is_deleted: false },
      transaction: t,
    });

    if (existingReview) {
      const err = new Error('A review has already been submitted for this service booking');
      err.statusCode = 409;
      throw err;
    }

    const listingId = booking.listing_id;
    const providerId = booking.provider_id || booking.listing?.provider_id;

    const review = await ServiceReview.create({
      booking_id,
      listing_id: listingId,
      provider_id: providerId,
      user_id: actorId,
      rating,
      comment,
      created_by: actorId,
    }, { transaction: t });

    // Server-side Rating Aggregation for Provider
    if (providerId) {
      const providerReviews = await ServiceReview.findAll({
        where: { provider_id: providerId, is_deleted: false },
        attributes: ['rating'],
        transaction: t,
      });

      const totalReviews = providerReviews.length;
      const sumRatings = providerReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0);
      const avgRating = totalReviews > 0 ? (sumRatings / totalReviews) : 0.00;
      const roundedAvg = Math.round(avgRating * 100) / 100;

      await ServiceProviderProfile.update(
        { rating: roundedAvg, review_count: totalReviews },
        { where: { id: providerId }, transaction: t }
      );
    }

    // Server-side Rating Aggregation for Service Listing
    if (listingId) {
      const listingReviews = await ServiceReview.findAll({
        where: { listing_id: listingId, is_deleted: false },
        attributes: ['rating'],
        transaction: t,
      });

      const totalListingReviews = listingReviews.length;
      const sumListingRatings = listingReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0);
      const avgListingRating = totalListingReviews > 0 ? (sumListingRatings / totalListingReviews) : 0.00;
      const roundedListingAvg = Math.round(avgListingRating * 100) / 100;

      await ServiceListing.update(
        { rating: roundedListingAvg, reviews_count: totalListingReviews },
        { where: { id: listingId }, transaction: t }
      );
    }

    await audit({
      actorId,
      action: 'SERVICE_REVIEW_CREATED',
      targetType: 'service_review',
      targetId: review.id,
      after: { booking_id, rating, providerId, listingId },
    });

    // Notify provider asynchronously
    setImmediate(async () => {
      try {
        const providerProfile = await ServiceProviderProfile.findByPk(providerId);
        if (providerProfile?.user_id) {
          await emitNotification({
            recipientId: providerProfile.user_id,
            actorId,
            type: 'service_review',
            title: 'New Service Review Received',
            message: `You received a ${rating}-star review: "${comment.slice(0, 80)}..."`,
            data: { target: 'review', reviewId: Number(review.id), bookingId: Number(booking_id) },
            preferenceKey: 'booking_requests',
            sendPush: true,
          });
        }
      } catch (notifErr) {
        logger.error('REVIEW_NOTIF_ERROR', notifErr.message);
      }
    });

    return review;
  });
};

export const getAllReviews = async ({ listing_id, provider_id, page = 1, limit = 20 } = {}) => {
  const where = { is_deleted: false };
  if (listing_id) where.listing_id = listing_id;
  if (provider_id) where.provider_id = provider_id;

  const offset = (Number(page) - 1) * Number(limit);

  return await ServiceReview.findAndCountAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName'] },
      { model: ServiceListing, as: 'listing', attributes: ['id', 'title'] },
    ],
    order: [['created_at', 'DESC']],
    limit: Number(limit),
    offset,
  });
};

export const getReviewById = async (id) => {
  return await ServiceReview.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName'] },
      { model: ServiceListing, as: 'listing', attributes: ['id', 'title'] },
    ],
  });
};

export const softDeleteReview = async (id, deletedRemarks, actorUser) => {
  const review = await ServiceReview.findOne({ where: { id, is_deleted: false } });
  if (!review) return null;

  const isAdmin = isGlobalAdminUser(actorUser);
  const actorId = actorUser?.id || actorUser?.userId;
  const isAuthor = review.user_id === actorId;

  if (!isAdmin && !isAuthor) {
    const err = new Error('Forbidden: You can only delete your own review');
    err.statusCode = 403;
    throw err;
  }

  return await review.update({
    is_deleted: true,
    deletedRemarks,
    updated_by: actorId,
    updatedAt: new Date(),
  });
};
