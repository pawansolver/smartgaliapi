import BusinessOffer from './business_offer.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

export const createOffer = async (offerData) => {
  return await BusinessOffer.create(offerData);
};

export const getAllOffers = async () => {
  return await BusinessOffer.findAll({
    where: { is_deleted: false },
    include: [
      { model: BusinessProfile, as: 'business', attributes: ['id', 'business_name'] }
    ]
  });
};

export const getOfferById = async (id) => {
  return await BusinessOffer.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: BusinessProfile, as: 'business', attributes: ['id', 'business_name'] }
    ]
  });
};

export const updateOffer = async (id, updateData) => {
  const offer = await BusinessOffer.findOne({ where: { id, is_deleted: false } });
  if (!offer) return null;
  return await offer.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteOffer = async (id, deletedRemarks, updated_by) => {
  const offer = await BusinessOffer.findOne({ where: { id, is_deleted: false } });
  if (!offer) return null;
  return await offer.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};
