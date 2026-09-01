import BusinessReview from './business_review.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import User from '../user/user.model.js';

export const createReview = async (reviewData) => {
  return await BusinessReview.create(reviewData);
};

export const getAllReviews = async () => {
  return await BusinessReview.findAll({
    where: { is_deleted: false },
    include: [
      { model: BusinessProfile, as: 'business', attributes: ['id', 'business_name'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'profile_image'] }
    ]
  });
};

export const getReviewById = async (id) => {
  return await BusinessReview.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: BusinessProfile, as: 'business', attributes: ['id', 'business_name'] },
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'profile_image'] }
    ]
  });
};

export const updateReview = async (id, updateData) => {
  const review = await BusinessReview.findOne({ where: { id, is_deleted: false } });
  if (!review) return null;
  return await review.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteReview = async (id, deletedRemarks, updated_by) => {
  const review = await BusinessReview.findOne({ where: { id, is_deleted: false } });
  if (!review) return null;
  return await review.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
