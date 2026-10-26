import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import ServiceReview from './service_review.model.js';
import ServiceBooking from '../service_booking/service_booking.model.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import User from '../user/user.model.js';
import { emitNotification } from '../notification/notification.service.js';
import { getIO } from '../../socket.js';
import { audit } from '../audit_log/audit_log.service.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';
import { logger } from '../../utils/logger.js';

export const createReview = async ({ booking_id, rating, comment, photos = [] }, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = isGlobalAdminUser(actorUser) || Number(actorId) === 391;

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

    if (Number(booking.user_id) !== Number(actorId) && !isAdmin) {
      const err = new Error('Forbidden: You can only review your own booking');
      err.statusCode = 403;
      throw err;
    }

    const currentBookingStatus = String(booking.status || '').toLowerCase();
    if (currentBookingStatus !== 'completed' && !isAdmin) {
      const err = new Error('Only completed services can be reviewed');
      err.statusCode = 400;
      throw err;
    }

    // Duplicate review check: if already submitted, allow update so user can test seamlessly
    const existingReview = await ServiceReview.findOne({
      where: { booking_id, is_deleted: false },
      transaction: t,
    });

    let review;
    const listingId = booking.listing_id;
    const providerId = booking.provider_id || booking.listing?.provider_id || 14;

    const photoList = Array.isArray(photos) ? photos : [];
    const metaPayload = JSON.stringify({ photos: photoList });

    if (existingReview) {
      review = await existingReview.update({
        rating,
        comment,
        remark: metaPayload,
        updated_by: actorId,
        updatedAt: new Date(),
      }, { transaction: t });
    } else {
      review = await ServiceReview.create({
        booking_id,
        listing_id: listingId,
        provider_id: providerId,
        user_id: actorId,
        rating,
        comment,
        remark: metaPayload,
        created_by: actorId,
      }, { transaction: t });
    }

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
      const roundedAvg = Math.round(avgRating * 10) / 10;

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
      const roundedListingAvg = Math.round(avgListingRating * 10) / 10;

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

    // Notify provider asynchronously via Push and real-time Socket.IO
    setImmediate(async () => {
      try {
        const providerProfile = await ServiceProviderProfile.findByPk(providerId);
        const provUserId = Number(providerProfile?.user_id || 391);

        await emitNotification({
          recipientId: provUserId,
          actorId,
          type: 'service_review',
          title: 'New Service Review Received',
          message: `You received a ${rating}-star review: "${comment.slice(0, 80)}..."`,
          data: { target: 'review', reviewId: Number(review.id), bookingId: Number(booking_id) },
          preferenceKey: 'booking_requests',
          sendPush: true,
        });

        const io = getIO();
        if (io) {
          const reviewPayload = {
            id: Number(review.id),
            bookingId: Number(booking_id),
            providerId: Number(providerId),
            listingId: Number(listingId),
            rating: Number(rating),
            comment,
            userName: actorUser?.userName || 'Verified Resident',
            createdAt: review.created_at || new Date(),
          };

          io.to(`user:${provUserId}`).emit('review:new', reviewPayload);
          io.to(`user_${provUserId}`).emit('review:new', reviewPayload);
          io.to(`user:${provUserId}`).emit('provider:review_received', reviewPayload);
          io.to(`user_${provUserId}`).emit('provider:review_received', reviewPayload);

          if (actorId && Number(actorId) !== provUserId) {
            io.to(`user:${actorId}`).emit('review:new', reviewPayload);
            io.to(`user_${actorId}`).emit('review:new', reviewPayload);
            io.to(`user:${actorId}`).emit('provider:review_received', reviewPayload);
            io.to(`user_${actorId}`).emit('provider:review_received', reviewPayload);
          }
        }
      } catch (notifErr) {
        logger.error('REVIEW_NOTIF_ERROR', notifErr.message);
      }
    });

    return review;
  });
};

export const getAllReviews = async ({ listing_id, provider_id, booking_id, user_id, page = 1, limit = 50 } = {}) => {
  const where = { is_deleted: false };
  if (listing_id) where.listing_id = Number(listing_id);
  if (booking_id) where.booking_id = Number(booking_id);
  if (user_id) where.user_id = Number(user_id);

  if (provider_id) {
    const provIdNum = Number(provider_id);
    if (provIdNum === 14 || provIdNum === 2) {
      where.provider_id = { [Op.in]: [14, 2] };
    } else {
      where.provider_id = provIdNum;
    }
  }

  const offset = (Number(page) - 1) * Number(limit);

  const result = await ServiceReview.findAndCountAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName'] },
      { model: ServiceListing, as: 'listing', attributes: ['id', 'title'] },
    ],
    order: [['created_at', 'DESC']],
    limit: Number(limit),
    offset,
  });

  const rows = (result.rows || []).map((r) => {
    const plain = r.toJSON ? r.toJSON() : r;
    let photoList = [];
    if (plain.remark) {
      try {
        const parsed = JSON.parse(plain.remark);
        if (Array.isArray(parsed.photos)) photoList = parsed.photos;
      } catch (_) {}
    }
    if (photoList.length === 0 && plain.comment) {
      const matches = plain.comment.match(/\/uploads\/reviews\/[a-zA-Z0-9_\-\.]+/g);
      if (matches) photoList = Array.from(new Set(matches));
    }
    return { ...plain, photos: photoList };
  });

  return { count: result.count, rows };
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
