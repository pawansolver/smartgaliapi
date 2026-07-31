import ServiceListing from './service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';

export const createListing = async (listingData) => {
  return await ServiceListing.create(listingData);
};

export const getAllListings = async () => {
  return await ServiceListing.findAll({
    where: { is_deleted: false },
    include: [
      { model: ServiceProviderProfile, as: 'provider', attributes: ['id', 'user_id', 'service_category_id', 'experience', 'hourly_rate'] }
    ]
  });
};

export const getListingById = async (id) => {
  return await ServiceListing.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: ServiceProviderProfile, as: 'provider', attributes: ['id', 'user_id', 'service_category_id', 'experience', 'hourly_rate'] }
    ]
  });
};

export const updateListing = async (id, updateData) => {
  const listing = await ServiceListing.findOne({ where: { id, is_deleted: false } });
  if (!listing) return null;
  return await listing.update({ ...updateData, updatedAt: new Date() });
};

export const softDeleteListing = async (id, deletedRemarks, updated_by) => {
  const listing = await ServiceListing.findOne({ where: { id, is_deleted: false } });
  if (!listing) return null;
  return await listing.update({ is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() });
};

export const bulkSoftDeleteListings = async (ids, deletedRemarks, updated_by) => {
  return await ServiceListing.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, is_deleted: false } }
  );
};
