import { Op } from 'sequelize';
import ServiceListing from './service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import ServiceCategory from '../service_category/service_category.model.js';
import ServiceSubcategory from '../service_category/service_subcategory.model.js';
import User from '../user/user.model.js';
import { getOrCreateProviderProfile } from '../service_provider_profile/service_provider_profile.service.js';
import { audit } from '../audit_log/audit_log.service.js';
import { emitNotification } from '../notification/notification.service.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';

export const createListing = async (listingData, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = isGlobalAdminUser(actorUser);

  let providerProfile = null;
  let providerId = listingData.provider_id;

  if (isAdmin && providerId) {
    providerProfile = await ServiceProviderProfile.findByPk(providerId);
    if (!providerProfile || providerProfile.is_deleted) {
      const error = new Error('Designated service provider profile not found');
      error.statusCode = 404;
      throw error;
    }
  } else {
    // Non-admin provider self-service flow
    providerProfile = await getOrCreateProviderProfile(actorId);
    providerId = providerProfile.id;

    // DEV BYPASS: Skip KYC trade restrictions in development mode if requested
    const isDevMode = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

    // ──────────────────────────────────────────────────────────────────────────
    // 1. MANDATORY KYC VERIFICATION AUTHORIZATION GUARD
    // ──────────────────────────────────────────────────────────────────────────
    if (!isDevMode) {
      if (providerProfile.verification_status === 'underReview') {
        const error = new Error('KYC verification is still in progress. You cannot create or publish services until verified by admin.');
        error.statusCode = 403;
        throw error;
      }
      if (providerProfile.verification_status === 'rejected') {
        const error = new Error('KYC verification was rejected. Please resubmit your KYC documents before creating services.');
        error.statusCode = 403;
        throw error;
      }
      if (!providerProfile.is_verified || providerProfile.verification_status !== 'verified') {
        const error = new Error('Provider KYC verification required before creating services.');
        error.statusCode = 403;
        throw error;
      }
    }
    if (false && providerProfile.verification_status === 'underReview') {
      const error = new Error('KYC verification is still in progress. You cannot create or publish services until verified by admin.');
      error.statusCode = 403;
      throw error;
    }

    if (providerProfile.verification_status === 'rejected') {
      const error = new Error('KYC verification was rejected. Please resubmit your KYC documents before creating services.');
      error.statusCode = 403;
      throw error;
    }

    if (!providerProfile.is_verified || providerProfile.verification_status !== 'verified') {
      const error = new Error('Provider KYC verification required before creating services.');
      error.statusCode = 403;
      throw error;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. MANDATORY VERIFIED TRADE / CATEGORY OWNERSHIP GUARD
    // ──────────────────────────────────────────────────────────────────────────
    const providerCategoryId = providerProfile.service_category_id ? Number(providerProfile.service_category_id) : null;
    const requestedCategoryId = listingData.category_id ? Number(listingData.category_id) : null;

    if (!isDevMode && !providerCategoryId) {
      const error = new Error('Provider does not have a verified trade category registered in profile.');
      error.statusCode = 403;
      throw error;
    }

    // If requested category differs from provider's verified trade skill, REJECT (403 Forbidden)
    if (!isDevMode && requestedCategoryId && requestedCategoryId !== providerCategoryId) {
      const error = new Error('Unauthorized category. You are only authorized to create services under your verified trade skill.');
      error.statusCode = 403;
      throw error;
    }
  }

  // Resolve final categoryId
  let categoryId = listingData.category_id ? Number(listingData.category_id) : null;
  if (!categoryId && providerProfile) {
    categoryId = providerProfile.service_category_id ? Number(providerProfile.service_category_id) : null;
  }

  if (!categoryId) {
    const error = new Error('Valid category_id is required to create a service listing');
    error.statusCode = 400;
    throw error;
  }

  // Verify category exists and is active
  const categoryRecord = await ServiceCategory.findOne({
    where: { serviceCategoryId: categoryId, is_active: true, is_deleted: false },
  });
  if (!categoryRecord) {
    const error = new Error('Selected service category does not exist or is inactive');
    error.statusCode = 400;
    throw error;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. MANDATORY SUBCATEGORY BELONGING & INTEGRITY GUARD
  // ──────────────────────────────────────────────────────────────────────────
  let subcategoryId = listingData.service_subcategory_id ? Number(listingData.service_subcategory_id) : null;
  if (subcategoryId) {
    const subcategoryRecord = await ServiceSubcategory.findOne({
      where: {
        service_subcategory_id: subcategoryId,
        is_active: true,
        is_deleted: false,
      },
    });

    if (!subcategoryRecord) {
      const error = new Error('Selected subcategory does not exist or is inactive');
      error.statusCode = 400;
      throw error;
    }

    if (Number(subcategoryRecord.service_category_id) !== Number(categoryId)) {
      const error = new Error('Subcategory does not belong to the selected service category');
      error.statusCode = 400;
      throw error;
    }
  }

  const listing = await ServiceListing.create({
    ...listingData,
    provider_id: providerId,
    category_id: categoryId,
    service_subcategory_id: subcategoryId,
    moderation_status: listingData.moderation_status || 'approved',
    is_available: listingData.is_available !== undefined ? listingData.is_available : true,
    created_by: actorId,
  });

  return await getListingById(listing.id);
};

export const getMyListings = async (userId) => {
  const profile = await getOrCreateProviderProfile(userId);
  return await ServiceListing.findAll({
    where: { provider_id: profile.id, is_deleted: false },
    include: [
      {
        model: ServiceProviderProfile,
        as: 'provider',
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName'] }],
      },
      { model: ServiceCategory, as: 'category' },
      { model: ServiceSubcategory, as: 'subcategory' },
    ],
    order: [['created_at', 'DESC']],
  });
};

export const getAllListings = async ({ category_id, service_subcategory_id, search, city, locality, pincode, min_price, max_price, page = 1, limit = 20 } = {}) => {
  const where = {
    is_deleted: false,
    is_available: true,
    moderation_status: 'approved',
  };

  if (category_id) {
    where[Op.or] = [
      { category_id },
      { '$provider.service_category_id$': category_id },
    ];
  }

  if (service_subcategory_id) {
    where.service_subcategory_id = service_subcategory_id;
  }

  if (search) {
    where[Op.or] = [
      { title: { [Op.like]: '%' + search + '%' } },
      { description: { [Op.like]: '%' + search + '%' } },
    ];
  }

  if (min_price != null || max_price != null) {
    where.price = {};
    if (min_price != null) where.price[Op.gte] = min_price;
    if (max_price != null) where.price[Op.lte] = max_price;
  }

  const providerWhere = { is_deleted: false };
  if (locality) {
    providerWhere.service_area = { [Op.like]: '%' + locality + '%' };
  }
  if (city) {
    providerWhere.service_area = { [Op.like]: '%' + city + '%' };
  }
  if (pincode) {
    providerWhere.service_area = { [Op.like]: '%' + pincode + '%' };
  }

  const offset = (Number(page) - 1) * Number(limit);

  const { rows, count } = await ServiceListing.findAndCountAll({
    where,
    include: [
      {
        model: ServiceProviderProfile,
        as: 'provider',
        where: providerWhere,
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'phone'] }],
      },
      { model: ServiceCategory, as: 'category', required: false },
      { model: ServiceSubcategory, as: 'subcategory', required: false },
    ],
    order: [['rating', 'DESC'], ['created_at', 'DESC']],
    limit: Number(limit),
    offset,
  });

  return { rows, count, totalPages: Math.ceil(count / Number(limit)), currentPage: Number(page) };
};

export const getAdminAllListings = async ({ moderation_status, page = 1, limit = 20 } = {}) => {
  const where = { is_deleted: false };
  if (moderation_status) where.moderation_status = moderation_status;
  const offset = (Number(page) - 1) * Number(limit);

  return await ServiceListing.findAndCountAll({
    where,
    include: [
      {
        model: ServiceProviderProfile,
        as: 'provider',
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName'] }],
      },
      { model: ServiceCategory, as: 'category' },
      { model: ServiceSubcategory, as: 'subcategory' },
    ],
    order: [['created_at', 'DESC']],
    limit: Number(limit),
    offset,
  });
};

export const getListingById = async (id) => {
  return await ServiceListing.findOne({
    where: { id, is_deleted: false },
    include: [
      {
        model: ServiceProviderProfile,
        as: 'provider',
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'phone'] }],
      },
      { model: ServiceCategory, as: 'category' },
      { model: ServiceSubcategory, as: 'subcategory' },
    ],
  });
};

export const updateListing = async (id, updateData, actorUser) => {
  const listing = await ServiceListing.findOne({
    where: { id, is_deleted: false },
    include: [{ model: ServiceProviderProfile, as: 'provider' }],
  });
  if (!listing) return null;

  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = isGlobalAdminUser(actorUser);
  const isOwner = listing.provider && Number(listing.provider.user_id) === Number(actorId);

  if (!isAdmin && !isOwner) {
    const error = new Error('Forbidden: You do not have permission to modify this service listing');
    error.statusCode = 403;
    throw error;
  }

  // If subcategory is updated, verify it belongs to category
  if (updateData.service_subcategory_id) {
    const catId = updateData.category_id || listing.category_id;
    const subcategoryRecord = await ServiceSubcategory.findOne({
      where: {
        service_subcategory_id: updateData.service_subcategory_id,
        is_active: true,
        is_deleted: false,
      },
    });
    if (!subcategoryRecord || Number(subcategoryRecord.service_category_id) !== Number(catId)) {
      const error = new Error('Subcategory does not belong to the service category');
      error.statusCode = 400;
      throw error;
    }
  }

  const previousData = listing.toJSON();
  await listing.update({ ...updateData, updated_by: actorId, updatedAt: new Date() });

  await audit({
    actorId,
    action: 'SERVICE_LISTING_UPDATED',
    targetType: 'service_listing',
    targetId: listing.id,
    before: previousData,
    after: listing.toJSON(),
  });

  return await getListingById(listing.id);
};

export const moderateListing = async (id, { moderation_status, moderation_remarks }, adminUserId) => {
  const listing = await ServiceListing.findOne({
    where: { id, is_deleted: false },
    include: [{ model: ServiceProviderProfile, as: 'provider' }],
  });
  if (!listing) return null;

  const previousStatus = listing.moderation_status;
  await listing.update({
    moderation_status,
    moderation_remarks,
    updated_by: adminUserId,
    updatedAt: new Date(),
  });

  await audit({
    actorId: adminUserId,
    action: 'SERVICE_LISTING_MODERATED',
    targetType: 'service_listing',
    targetId: listing.id,
    before: { moderation_status: previousStatus },
    after: { moderation_status, moderation_remarks },
  });

  if (listing.provider && listing.provider.user_id) {
    await emitNotification({
      user_id: listing.provider.user_id,
      title: 'Service Listing Status Updated',
      message: `Your listing "${listing.title}" is now ${moderation_status}.`,
      type: 'service_listing_status',
      data: { listing_id: listing.id, moderation_status },
    });
  }

  return listing;
};

export const deleteListing = async (id, deletedRemarks, actorUser) => {
  const listing = await ServiceListing.findOne({
    where: { id, is_deleted: false },
    include: [{ model: ServiceProviderProfile, as: 'provider' }],
  });
  if (!listing) return null;

  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = isGlobalAdminUser(actorUser);
  const isOwner = listing.provider && Number(listing.provider.user_id) === Number(actorId);

  if (!isAdmin && !isOwner) {
    const error = new Error('You do not have permission to delete this service listing');
    error.statusCode = 403;
    throw error;
  }

  const previousData = listing.toJSON();
  await listing.update({
    is_deleted: true,
    deletedRemarks: deletedRemarks || 'Soft deleted',
    updated_by: actorId,
    updatedAt: new Date(),
  });

  await audit({
    actorId,
    action: 'SERVICE_LISTING_DELETED',
    targetType: 'service_listing',
    targetId: listing.id,
    before: previousData,
    after: listing.toJSON(),
  });

  return listing;
};

export const bulkDeleteListings = async (ids, deletedRemarks, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  return await ServiceListing.update(
    {
      is_deleted: true,
      deletedRemarks: deletedRemarks || 'Bulk soft delete',
      updated_by: actorId,
      updatedAt: new Date(),
    },
    {
      where: {
        id: ids,
        is_deleted: false,
      },
    }
  );
};

export const pauseListing = async (listingId, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const listing = await ServiceListing.findByPk(listingId, {
    include: [{ model: ServiceProviderProfile, as: 'provider' }],
  });
  if (!listing || listing.is_deleted) {
    throw new Error('Service listing not found');
  }

  const isOwner = listing.provider && Number(listing.provider.user_id) === Number(actorId);
  const isAdmin = ['admin', 'superadmin', 'manager'].includes(actorUser?.userRole || actorUser?.role);
  if (!isOwner && !isAdmin) {
    throw new Error('Forbidden: You do not have permission to modify this service listing');
  }

  const previousData = listing.toJSON();
  await listing.update({
    is_available: false,
    moderation_status: 'paused',
    updated_by: actorId,
    updatedAt: new Date(),
  });

  await audit({
    actorId,
    action: 'SERVICE_LISTING_PAUSED',
    targetType: 'service_listing',
    targetId: listing.id,
    before: previousData,
    after: listing.toJSON(),
  });

  return listing;
};

export const resumeListing = async (listingId, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const listing = await ServiceListing.findByPk(listingId, {
    include: [{ model: ServiceProviderProfile, as: 'provider' }],
  });
  if (!listing || listing.is_deleted) {
    throw new Error('Service listing not found');
  }

  const isOwner = listing.provider && Number(listing.provider.user_id) === Number(actorId);
  const isAdmin = ['admin', 'superadmin', 'manager'].includes(actorUser?.userRole || actorUser?.role);
  if (!isOwner && !isAdmin) {
    throw new Error('Forbidden: You do not have permission to modify this service listing');
  }

  const previousData = listing.toJSON();
  await listing.update({
    is_available: true,
    moderation_status: 'approved',
    updated_by: actorId,
    updatedAt: new Date(),
  });

  await audit({
    actorId,
    action: 'SERVICE_LISTING_RESUMED',
    targetType: 'service_listing',
    targetId: listing.id,
    before: previousData,
    after: listing.toJSON(),
  });

  return listing;
};
