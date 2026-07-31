import ServiceReview from './service_review.model.js';
import ServiceBooking from '../service_booking/service_booking.model.js';
import User from '../user/user.model.js';

export const createReview = async (reviewData) => {
  return await ServiceReview.create(reviewData);
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
