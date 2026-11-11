import { fn, col } from 'sequelize';
import BusinessReview from './business_review.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import User from '../user/user.model.js';

const USER_PUBLIC_ATTRS = ['userId', 'userName', 'email'];

const formatReview = (inst) => {
  if (!inst) return null;
  const r = inst.toJSON ? inst.toJSON() : { ...inst };
  return {
    ...r,
    businessId: r.business_id,
    userId: r.user_id,
    userName: r.user?.userName || 'SmartGali Resident',
    createdAt: r.created_at ?? r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
  };
};

export const createReview = async (reviewData = {}) => {
  const businessId = Number(reviewData.business_id ?? reviewData.businessId);
  const userId = Number(reviewData.user_id ?? reviewData.userId);
  const rating = Number(reviewData.rating);

  if (!Number.isInteger(businessId) || businessId <= 0) {
    throw new Error('Valid business_id is required.');
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('Valid user_id is required to submit a review.');
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5.');
  }

  const created = await BusinessReview.create({
    business_id: businessId,
    user_id: userId,
    rating: Math.round(rating),
    comment: reviewData.comment?.toString().trim() || null,
    created_by: reviewData.created_by ?? userId,
    created_at: new Date(),
    updatedAt: new Date(),
  });
  return getReviewById(created.id);
};

export const getAllReviews = async (filters = {}) => {
  const where = { is_deleted: false };
  const bizId = Number(filters.business_id ?? filters.businessId);
  if (Number.isInteger(bizId) && bizId > 0) {
    where.business_id = bizId;
  }

  const rows = await BusinessReview.findAll({
    where,
    include: [
      { model: BusinessProfile, as: 'business', attributes: ['id', 'businessName'], required: false },
      { model: User, as: 'user', attributes: USER_PUBLIC_ATTRS, required: false },
    ],
    order: [['id', 'DESC']],
  });
  return rows.map(formatReview);
};

export const getReviewsByBusinessId = async (businessId) => {
  const bId = Number(businessId);
  if (!Number.isInteger(bId) || bId <= 0) {
    throw new Error('Valid businessId is required.');
  }
  const items = await getAllReviews({ business_id: bId });
  const breakdownRows = await BusinessReview.findAll({
    attributes: ['rating', [fn('COUNT', col('id')), 'cnt']],
    where: { business_id: bId, is_deleted: false },
    group: ['rating'],
    raw: true,
  });
  const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let totalCount = 0;
  let weightedSum = 0;
  for (const row of breakdownRows) {
    const star = Number(row.rating);
    const cnt = Number(row.cnt || 0);
    if (star >= 1 && star <= 5) {
      breakdown[star] = cnt;
      totalCount += cnt;
      weightedSum += star * cnt;
    }
  }
  const avg = totalCount > 0 ? Number((weightedSum / totalCount).toFixed(1)) : null;
  return {
    items,
    summary: {
      business_id: bId,
      rating: avg,
      review_count: totalCount,
      breakdown,
    },
  };
};

export const getReviewById = async (id) => {
  const review = await BusinessReview.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: BusinessProfile, as: 'business', attributes: ['id', 'businessName'], required: false },
      { model: User, as: 'user', attributes: USER_PUBLIC_ATTRS, required: false },
    ],
  });
  return formatReview(review);
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
