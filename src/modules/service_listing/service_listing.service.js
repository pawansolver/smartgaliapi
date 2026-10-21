import ServiceListingMedia, { SERVICE_MEDIA_STATUS } from './service_listing_media.model.js';
import { getImageUrl, removeLocalUpload } from '../../utils/fileUpload.js';
import SocietyServiceAccess from '../society_service_access/society_service_access.model.js';
import { calculateAuthoritativeServicePrice } from './service_pricing.service.js';
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
import {
  ServicePricingModel,
  ServicePricingUnit,
  ServiceDurationOption,
  ServiceBufferOption,
  ServiceInspectionFeeType,
  ServiceInspectionAdjustment,
  ServiceMaterialPolicy,
  ServiceChargeType,
  ServiceWarrantyOption,
  ServiceExecutionMethod,
  ServiceAreaType,
  ServiceRadiusOption,
  ServiceSlotDuration,
  ServiceBookingCapacity,
  ServicePackage,
  ServiceAddon,
  ServicePackageLevel,
  ServiceAddonType,
} from '../service_config/service_config.models.js';
import ServiceCoverageArea from './service_coverage_area.model.js';
import { City, Locality, Pincode } from '../location_master/location_master.models.js';
import SocietyProfile from '../society_profile/society_profile.model.js';

// Standard master validation helper: checks if record exists and is_active
async function validateMasterRecord(model, id, fieldName) {
  if (!id) return null;
  let record = await model.findOne({ where: { id, is_deleted: false } });
  
  if (!record && (fieldName === 'Radius Option' || model.name === 'ServiceRadiusOption')) {
    // Smart recovery: check if id was passed as radius in KM (e.g. 10 -> 10 KM, 20 -> 20 KM)
    record = await model.findOne({ where: { radius_km: id, is_deleted: false } });
    if (!record) {
      // Fallback to active radius option (e.g. 20_KM id: 4)
      record = await model.findOne({ where: { is_active: true, is_deleted: false }, order: [['id', 'ASC']] });
    }
  }

  if (!record) {
    const error = new Error(`Invalid ${fieldName}: record not found (ID ${id})`);
    error.statusCode = 400;
    throw error;
  }
  if (!record.is_active) {
    const error = new Error(`Inactive ${fieldName}: ID ${id} is inactive and cannot be selected`);
    error.statusCode = 400;
    throw error;
  }
  return record;
}

// Master includes for eager-loading
export const listingMasterIncludes = [
  { model: ServiceCategory, as: 'category' },
  { model: ServiceSubcategory, as: 'subcategory' },
  { model: ServicePricingModel, as: 'pricing_model' },
  { model: ServicePricingUnit, as: 'pricing_unit' },
  { model: ServiceDurationOption, as: 'duration_option' },
  { model: ServiceDurationOption, as: 'min_duration_option' },
  { model: ServiceBufferOption, as: 'buffer_option' },
  { model: ServiceInspectionFeeType, as: 'inspection_fee_type' },
  { model: ServiceInspectionAdjustment, as: 'inspection_adjustment' },
  { model: ServiceMaterialPolicy, as: 'material_policy' },
  { model: ServiceChargeType, as: 'charge_type' },
  { model: ServiceWarrantyOption, as: 'warranty_option' },
  { model: ServiceExecutionMethod, as: 'execution_method' },
  { model: ServiceAreaType, as: 'service_area_type' },
  { model: ServiceRadiusOption, as: 'radius_option' },
  { model: ServiceSlotDuration, as: 'slot_duration' },
  { model: ServiceBookingCapacity, as: 'booking_capacity' },
  { model: ServicePackage, as: 'packages' },
  {
    model: ServiceListingMedia,
    as: 'media_items',
    where: { is_deleted: false, status: 'active' },
    required: false,
  },
  { model: ServiceAddon, as: 'addons' },
  {
    model: ServiceCoverageArea,
    as: 'coverage_areas',
    where: { is_deleted: false },
    required: false,
    include: [
      { model: ServiceRadiusOption, as: 'radius_option' },
      { model: City, as: 'city' },
      { model: Locality, as: 'locality' },
      { model: Pincode, as: 'pincode' },
      { model: SocietyProfile, as: 'society' },
    ],
  },
];

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
    if (!isAdmin) {
      if (!providerProfile.is_verified || providerProfile.verification_status !== 'verified') {
        const error = new Error('Provider KYC verification required before creating services.');
        error.statusCode = 403;
        throw error;
      }

      // Trade Category Authorization Check
      if (providerProfile.service_category_id && listingData.category_id) {
        if (Number(providerProfile.service_category_id) !== Number(listingData.category_id)) {
          const error = new Error('Unauthorized category: provider is only verified for their registered trade category');
          error.statusCode = 403;
          throw error;
        }
      }
    }
  }

  // Validate Category exists and is active
  if (listingData.category_id) {
    const categoryRecord = await ServiceCategory.findOne({
      where: { serviceCategoryId: listingData.category_id, is_deleted: false }
    });
    if (!categoryRecord) {
      const error = new Error(`Category not found: ID ${listingData.category_id}`);
      error.statusCode = 400;
      throw error;
    }
    if (!categoryRecord.is_active) {
      const error = new Error(`Category ID ${listingData.category_id} is inactive`);
      error.statusCode = 400;
      throw error;
    }
  }

  // Validate Subcategory exists, is active, and belongs to Category
  if (listingData.service_subcategory_id) {
    const subcatRecord = await ServiceSubcategory.findOne({
      where: { service_subcategory_id: listingData.service_subcategory_id, is_deleted: false }
    });
    if (!subcatRecord) {
      const error = new Error(`Subcategory not found: ID ${listingData.service_subcategory_id}`);
      error.statusCode = 400;
      throw error;
    }
    if (!subcatRecord.is_active) {
      const error = new Error(`Subcategory ID ${listingData.service_subcategory_id} is inactive`);
      error.statusCode = 400;
      throw error;
    }
    if (listingData.category_id && Number(subcatRecord.service_category_id) !== Number(listingData.category_id)) {
      const error = new Error(`Subcategory does not belong to the selected category`);
      error.statusCode = 400;
      throw error;
    }
  }

  // 1. ENTERPRISE MASTER DATA VALIDATIONS & ENFORCEMENT
  let pricingModel = null;
  let pricingUnit = null;

  if (listingData.pricing_model_id) {
    pricingModel = await validateMasterRecord(ServicePricingModel, listingData.pricing_model_id, 'Pricing Model');
  }
  if (listingData.pricing_unit_id) {
    pricingUnit = await validateMasterRecord(ServicePricingUnit, listingData.pricing_unit_id, 'Pricing Unit');
    if (pricingModel && pricingUnit.pricing_model_code !== pricingModel.code) {
      const error = new Error(`Invalid Pricing Unit: '${pricingUnit.name}' is not valid for Pricing Model '${pricingModel.name}'`);
      error.statusCode = 400;
      throw error;
    }
  }

  let durationOption = null;
  if (listingData.duration_option_id) {
    durationOption = await validateMasterRecord(ServiceDurationOption, listingData.duration_option_id, 'Duration Option');
    listingData.duration = durationOption.label;
  }
  if (listingData.min_duration_id) {
    await validateMasterRecord(ServiceDurationOption, listingData.min_duration_id, 'Minimum Duration Option');
  }
  if (listingData.buffer_option_id) {
    await validateMasterRecord(ServiceBufferOption, listingData.buffer_option_id, 'Buffer Option');
  }
  if (listingData.inspection_fee_type_id) {
    await validateMasterRecord(ServiceInspectionFeeType, listingData.inspection_fee_type_id, 'Inspection Fee Type');
  }
  if (listingData.inspection_adjustment_id) {
    await validateMasterRecord(ServiceInspectionAdjustment, listingData.inspection_adjustment_id, 'Inspection Adjustment');
  }
  if (listingData.material_policy_id) {
    await validateMasterRecord(ServiceMaterialPolicy, listingData.material_policy_id, 'Material Policy');
  }
  if (listingData.charge_type_id) {
    await validateMasterRecord(ServiceChargeType, listingData.charge_type_id, 'Charge Type');
  }
  if (listingData.warranty_option_id) {
    await validateMasterRecord(ServiceWarrantyOption, listingData.warranty_option_id, 'Warranty Option');
  }
  if (listingData.execution_method_id) {
    await validateMasterRecord(ServiceExecutionMethod, listingData.execution_method_id, 'Execution Method');
  }
  if (listingData.service_area_type_id) {
    await validateMasterRecord(ServiceAreaType, listingData.service_area_type_id, 'Service Area Type');
  }
  if (listingData.radius_option_id) {
    await validateMasterRecord(ServiceRadiusOption, listingData.radius_option_id, 'Radius Option');
  }
  if (listingData.slot_duration_id) {
    await validateMasterRecord(ServiceSlotDuration, listingData.slot_duration_id, 'Slot Duration');
  }
  if (listingData.booking_capacity_id) {
    await validateMasterRecord(ServiceBookingCapacity, listingData.booking_capacity_id, 'Booking Capacity');
  }

  // 2. CONDITIONAL PRICING BUSINESS RULES ENFORCEMENT
  if (pricingModel) {
    if (pricingModel.code === 'FIXED') {
      if (listingData.price == null || Number(listingData.price) < 0) {
        const error = new Error('Base Price is mandatory for Fixed Rate pricing model');
        error.statusCode = 400;
        throw error;
      }
    } else if (pricingModel.code === 'HOURLY') {
      if (listingData.hourly_rate == null || Number(listingData.hourly_rate) <= 0) {
        const error = new Error('Hourly Rate is mandatory for Hourly Rate pricing model');
        error.statusCode = 400;
        throw error;
      }
      listingData.price = listingData.hourly_rate;
    } else if (pricingModel.code === 'INSPECTION') {
      if (listingData.inspection_fee == null || Number(listingData.inspection_fee) < 0) {
        const error = new Error('Inspection Fee is mandatory for Inspection Based pricing model');
        error.statusCode = 400;
        throw error;
      }
      listingData.price = listingData.inspection_fee;
    }
  }

  // Separate child collections before creating listing
  const packagesData = listingData.packages || [];
  const addonsData = listingData.addons || [];
  const coverageAreasData = listingData.coverage_areas || [];

  delete listingData.packages;
  delete listingData.addons;
  delete listingData.coverage_areas;

  // Step 5: Validate max 5 photos in createListing
  if (listingData.images) {
    let rawImages = listingData.images;
    if (typeof rawImages === 'string') {
      try { rawImages = JSON.parse(rawImages); } catch (_) { rawImages = [rawImages]; }
    }
    if (Array.isArray(rawImages) && rawImages.length > 5) {
      const error = new Error('Maximum 5 portfolio photos allowed per service listing');
      error.statusCode = 400;
      throw error;
    }
  }

  const listingRecord = await ServiceListing.create({
    ...listingData,
    provider_id: providerId,
    coverage_scope: listingData.coverage_scope || 'PUBLIC',
    created_by: actorId,
    moderation_status: listingData.moderation_status || 'approved',
    is_active: listingData.is_active !== undefined ? listingData.is_active : true,
  });

  // Create Child Packages
  if (packagesData.length > 0) {
    const seenPackageLevels = new Set();
    for (let i = 0; i < packagesData.length; i++) {
      const pkg = packagesData[i];
      if (pkg.package_level_id) {
        if (seenPackageLevels.has(Number(pkg.package_level_id))) {
          const error = new Error(`Duplicate package level: only one package per package level tier is allowed`);
          error.statusCode = 400;
          throw error;
        }
        seenPackageLevels.add(Number(pkg.package_level_id));
        await validateMasterRecord(ServicePackageLevel, pkg.package_level_id, 'Package Level');
      }
      await ServicePackage.create({
        service_id: listingRecord.id,
        package_level_id: pkg.package_level_id || null,
        name: pkg.name,
        description: pkg.description || null,
        price: pkg.price,
        duration_minutes: pkg.duration_minutes || null,
        included_items: pkg.included_items || [],
        display_order: i + 1,
      });
    }
  }

  // Create Child Addons
  if (addonsData.length > 0) {
    const seenAddons = new Set();
    for (let i = 0; i < addonsData.length; i++) {
      const add = addonsData[i];
      const addonKey = `${add.addon_type_id || 'custom'}_${add.name.trim().toLowerCase()}`;
      if (seenAddons.has(addonKey)) {
        const error = new Error(`Duplicate addon: an addon named '${add.name}' already exists in this service`);
        error.statusCode = 400;
        throw error;
      }
      seenAddons.add(addonKey);
      if (add.addon_type_id) {
        await validateMasterRecord(ServiceAddonType, add.addon_type_id, 'Addon Type');
      }
      await ServiceAddon.create({
        service_id: listingRecord.id,
        addon_type_id: add.addon_type_id || null,
        name: add.name,
        description: add.description || null,
        price: add.price,
        is_enabled: add.is_enabled !== false,
        display_order: i + 1,
      });
    }
  }

  // Create Child Coverage Areas (Step 4 Enterprise Geospatial Hardening)
  if (coverageAreasData.length > 0) {
    for (let i = 0; i < coverageAreasData.length; i++) {
      const area = coverageAreasData[i];
      let resolvedRadiusKm = null;

      if (area.radius_option_id) {
        const ro = await validateMasterRecord(ServiceRadiusOption, area.radius_option_id, 'Radius Option');
        resolvedRadiusKm = Number(ro.radius_km);
        area.radius_option_id = ro.id; // Store authoritative database ID
      }

      if (area.city_id) {
        await validateMasterRecord(City, area.city_id, 'City');
      }
      if (area.locality_id) {
        await validateMasterRecord(Locality, area.locality_id, 'Locality');
      }
      if (area.pincode_id) {
        await validateMasterRecord(Pincode, area.pincode_id, 'Pincode');
      }
      if (area.society_id) {
        const soc = await SocietyProfile.findOne({ where: { id: area.society_id, is_deleted: false } });
        if (!soc) {
          const error = new Error(`Society not found: ID ${area.society_id}`);
          error.statusCode = 400;
          throw error;
        }
      }

      await ServiceCoverageArea.create({
        service_id: listingRecord.id,
        coverage_scope: area.coverage_scope || listingRecord.coverage_scope || 'PUBLIC',
        coverage_method: area.coverage_method || 'RADIUS',
        city_id: area.city_id || null,
        locality_id: area.locality_id || null,
        pincode_id: area.pincode_id || null,
        society_id: area.society_id || null,
        origin_latitude: area.origin_latitude != null ? area.origin_latitude : null,
        origin_longitude: area.origin_longitude != null ? area.origin_longitude : null,
        origin_address: area.origin_address || null,
        radius_option_id: area.radius_option_id || null,
        resolved_radius_km: resolvedRadiusKm,
        is_active: area.is_active !== false,
        display_order: i + 1,
      });
    }
  } else if (listingRecord.radius_option_id) {
    // Fallback: auto-generate default coverage area from single listing radius_option_id
    const ro = await ServiceRadiusOption.findOne({ where: { id: listingRecord.radius_option_id } });
    if (ro) {
      await ServiceCoverageArea.create({
        service_id: listingRecord.id,
        coverage_scope: listingRecord.coverage_scope || 'PUBLIC',
        coverage_method: 'RADIUS',
        origin_latitude: 25.6022,
        origin_longitude: 85.1610,
        origin_address: 'Patna Service Base',
        radius_option_id: listingRecord.radius_option_id,
        resolved_radius_km: Number(ro.radius_km),
        is_active: true,
        display_order: 1,
      });
    }
  }

  await audit({
    actorId,
    action: 'service_listing.create',
    targetType: 'service_listing',
    targetId: listingRecord.id,
    after: listingRecord.toJSON(),
  });

    // Step 5: Synchronize ServiceListingMedia
  let rawImagesForSync = listingData.images;
  if (typeof rawImagesForSync === 'string') {
    try { rawImagesForSync = JSON.parse(rawImagesForSync); } catch (_) { rawImagesForSync = []; }
  }
  if (Array.isArray(rawImagesForSync) && rawImagesForSync.length > 0) {
    for (let i = 0; i < rawImagesForSync.length; i++) {
      const u = rawImagesForSync[i];
      if (u && typeof u === 'string') {
        await ServiceListingMedia.create({
          service_listing_id: listingRecord.id,
          provider_id: providerId,
          media_url: u,
          media_type: 'image',
          display_order: i + 1,
          is_primary: i === 0,
          status: SERVICE_MEDIA_STATUS.ACTIVE,
          is_active: true,
          is_deleted: false,
          created_by: actorId,
        });
      }
    }
  }

  return await getListingById(listingRecord.id);
};

export const updateListing = async (id, updateData, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = isGlobalAdminUser(actorUser);

  const listing = await ServiceListing.findOne({
    where: { id, is_deleted: false },
    include: [{ model: ServiceProviderProfile, as: 'provider' }]
  });

  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }

  if (!isAdmin && listing.provider?.user_id !== actorId) {
    const error = new Error('Forbidden: you do not have permission to update this service listing');
    error.statusCode = 403;
    throw error;
  }

  if (updateData.pricing_model_id) {
    await validateMasterRecord(ServicePricingModel, updateData.pricing_model_id, 'Pricing Model');
  }
  if (updateData.pricing_unit_id) {
    await validateMasterRecord(ServicePricingUnit, updateData.pricing_unit_id, 'Pricing Unit');
  }
  const effectiveModelId = updateData.pricing_model_id || listing.pricing_model_id;
  const effectiveUnitId = updateData.pricing_unit_id || listing.pricing_unit_id;
  if (effectiveModelId && effectiveUnitId) {
    const pModel = await validateMasterRecord(ServicePricingModel, effectiveModelId, 'Pricing Model');
    const pUnit = await validateMasterRecord(ServicePricingUnit, effectiveUnitId, 'Pricing Unit');
    if (pModel && pUnit && pUnit.pricing_model_code !== pModel.code) {
      const error = new Error(`Invalid Pricing Unit: '${pUnit.name}' is not valid for Pricing Model '${pModel.name}'`);
      error.statusCode = 400;
      throw error;
    }
  }
  if (updateData.duration_option_id) {
    const durationOpt = await validateMasterRecord(ServiceDurationOption, updateData.duration_option_id, 'Duration Option');
    updateData.duration = durationOpt.label;
  }
  if (updateData.min_duration_id) {
    await validateMasterRecord(ServiceDurationOption, updateData.min_duration_id, 'Minimum Duration Option');
  }
  if (updateData.buffer_option_id) {
    await validateMasterRecord(ServiceBufferOption, updateData.buffer_option_id, 'Buffer Option');
  }
  if (updateData.inspection_fee_type_id) {
    await validateMasterRecord(ServiceInspectionFeeType, updateData.inspection_fee_type_id, 'Inspection Fee Type');
  }
  if (updateData.inspection_adjustment_id) {
    await validateMasterRecord(ServiceInspectionAdjustment, updateData.inspection_adjustment_id, 'Inspection Adjustment');
  }
  if (updateData.material_policy_id) {
    await validateMasterRecord(ServiceMaterialPolicy, updateData.material_policy_id, 'Material Policy');
  }
  if (updateData.charge_type_id) {
    await validateMasterRecord(ServiceChargeType, updateData.charge_type_id, 'Charge Type');
  }
  if (updateData.warranty_option_id) {
    await validateMasterRecord(ServiceWarrantyOption, updateData.warranty_option_id, 'Warranty Option');
  }
  if (updateData.execution_method_id) {
    await validateMasterRecord(ServiceExecutionMethod, updateData.execution_method_id, 'Execution Method');
  }
  if (updateData.service_area_type_id) {
    await validateMasterRecord(ServiceAreaType, updateData.service_area_type_id, 'Service Area Type');
  }
  if (updateData.radius_option_id) {
    await validateMasterRecord(ServiceRadiusOption, updateData.radius_option_id, 'Radius Option');
  }
  if (updateData.slot_duration_id) {
    await validateMasterRecord(ServiceSlotDuration, updateData.slot_duration_id, 'Slot Duration');
  }
  if (updateData.booking_capacity_id) {
    await validateMasterRecord(ServiceBookingCapacity, updateData.booking_capacity_id, 'Booking Capacity');
  }

  // Step 5: Validate max 5 photos in updateListing
  if (updateData.images !== undefined) {
    let rawImages = updateData.images;
    if (typeof rawImages === 'string') {
      try { rawImages = JSON.parse(rawImages); } catch (_) { rawImages = [rawImages]; }
    }
    if (Array.isArray(rawImages) && rawImages.length > 5) {
      const error = new Error('Maximum 5 portfolio photos allowed per service listing');
      error.statusCode = 400;
      throw error;
    }
  }

  const beforeSnapshot = listing.toJSON();
  const packagesData = updateData.packages;
  const addonsData = updateData.addons;
  const coverageAreasData = updateData.coverage_areas;

  delete updateData.packages;
  delete updateData.addons;
  delete updateData.coverage_areas;

  await listing.update({
    ...updateData,
    updated_by: actorId,
  });

  // Update Packages if provided
  if (Array.isArray(packagesData)) {
    const seenPackageLevels = new Set();
    await ServicePackage.destroy({ where: { service_id: listing.id } });
    for (let i = 0; i < packagesData.length; i++) {
      const pkg = packagesData[i];
      if (pkg.package_level_id) {
        if (seenPackageLevels.has(Number(pkg.package_level_id))) {
          const error = new Error(`Duplicate package level: only one package per package level tier is allowed`);
          error.statusCode = 400;
          throw error;
        }
        seenPackageLevels.add(Number(pkg.package_level_id));
        await validateMasterRecord(ServicePackageLevel, pkg.package_level_id, 'Package Level');
      }
      await ServicePackage.create({
        service_id: listing.id,
        package_level_id: pkg.package_level_id || null,
        name: pkg.name,
        description: pkg.description || null,
        price: pkg.price,
        duration_minutes: pkg.duration_minutes || null,
        included_items: pkg.included_items || [],
        display_order: i + 1,
      });
    }
  }

  // Update Addons if provided
  if (Array.isArray(addonsData)) {
    const seenAddons = new Set();
    await ServiceAddon.destroy({ where: { service_id: listing.id } });
    for (let i = 0; i < addonsData.length; i++) {
      const add = addonsData[i];
      const addonKey = `${add.addon_type_id || 'custom'}_${add.name.trim().toLowerCase()}`;
      if (seenAddons.has(addonKey)) {
        const error = new Error(`Duplicate addon: an addon named '${add.name}' already exists in this service`);
        error.statusCode = 400;
        throw error;
      }
      seenAddons.add(addonKey);
      if (add.addon_type_id) {
        await validateMasterRecord(ServiceAddonType, add.addon_type_id, 'Addon Type');
      }
      await ServiceAddon.create({
        service_id: listing.id,
        addon_type_id: add.addon_type_id || null,
        name: add.name,
        description: add.description || null,
        price: add.price,
        is_enabled: add.is_enabled !== false,
        display_order: i + 1,
      });
    }
  }

  // Update Multi-Coverage Areas if provided
  if (Array.isArray(coverageAreasData)) {
    await ServiceCoverageArea.destroy({ where: { service_id: listing.id } });
    for (let i = 0; i < coverageAreasData.length; i++) {
      const area = coverageAreasData[i];
      let resolvedRadiusKm = null;

      if (area.radius_option_id) {
        const ro = await validateMasterRecord(ServiceRadiusOption, area.radius_option_id, 'Radius Option');
        resolvedRadiusKm = Number(ro.radius_km);
      }

      if (area.city_id) {
        await validateMasterRecord(City, area.city_id, 'City');
      }
      if (area.locality_id) {
        await validateMasterRecord(Locality, area.locality_id, 'Locality');
      }
      if (area.pincode_id) {
        await validateMasterRecord(Pincode, area.pincode_id, 'Pincode');
      }
      if (area.society_id) {
        const soc = await SocietyProfile.findOne({ where: { id: area.society_id, is_deleted: false } });
        if (!soc) {
          const error = new Error(`Society not found: ID ${area.society_id}`);
          error.statusCode = 400;
          throw error;
        }
      }

      await ServiceCoverageArea.create({
        service_id: listing.id,
        coverage_scope: area.coverage_scope || listing.coverage_scope || 'PUBLIC',
        coverage_method: area.coverage_method || 'RADIUS',
        city_id: area.city_id || null,
        locality_id: area.locality_id || null,
        pincode_id: area.pincode_id || null,
        society_id: area.society_id || null,
        origin_latitude: area.origin_latitude != null ? area.origin_latitude : null,
        origin_longitude: area.origin_longitude != null ? area.origin_longitude : null,
        origin_address: area.origin_address || null,
        radius_option_id: area.radius_option_id || null,
        resolved_radius_km: resolvedRadiusKm,
        is_active: area.is_active !== false,
        display_order: i + 1,
      });
    }
  }

  // Step 5: Sync ServiceListingMedia on update if images provided
  if (updateData.images !== undefined) {
    let rawImages = updateData.images;
    if (typeof rawImages === 'string') {
      try { rawImages = JSON.parse(rawImages); } catch (_) { rawImages = []; }
    }
    if (Array.isArray(rawImages)) {
      await ServiceListingMedia.update(
        { is_deleted: true, status: SERVICE_MEDIA_STATUS.DELETED, updated_by: actorId, updatedAt: new Date() },
        { where: { service_listing_id: listing.id, status: SERVICE_MEDIA_STATUS.ACTIVE } }
      );
      for (let i = 0; i < rawImages.length; i++) {
        const u = rawImages[i];
        if (u && typeof u === 'string') {
          await ServiceListingMedia.create({
            service_listing_id: listing.id,
            provider_id: listing.provider_id,
            media_url: u,
            media_type: 'image',
            display_order: i + 1,
            is_primary: i === 0,
            status: SERVICE_MEDIA_STATUS.ACTIVE,
            is_active: true,
            is_deleted: false,
            created_by: actorId,
          });
        }
      }
    }
  }

  await audit({
    actorId,
    action: 'service_listing.update',
    targetType: 'service_listing',
    targetId: listing.id,
    before: beforeSnapshot,
    after: listing.toJSON(),
  });

  return await getListingById(listing.id);
};

export const moderateListing = async (id, { moderation_status, moderation_remarks }, actorId) => {
  const listing = await ServiceListing.findOne({ where: { id, is_deleted: false } });
  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }
  const beforeSnapshot = listing.toJSON();
  await listing.update({
    moderation_status,
    moderation_remarks: moderation_remarks || null,
    updated_by: actorId,
  });
  await audit({
    actorId,
    action: 'service_listing.moderate',
    targetType: 'service_listing',
    targetId: id,
    before: beforeSnapshot,
    after: listing.toJSON(),
  });
  return await getListingById(id);
};

export const getListingById = async (id) => {
  const listing = await ServiceListing.findOne({
    where: { id, is_deleted: false },
    include: [
      {
        model: ServiceProviderProfile,
        as: 'provider',
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'phone', 'email'] }]
      },
      ...listingMasterIncludes,
    ]
  });

  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }

  return listing;
};

export const getAllListings = async (query = {}) => {
  const {
    category_id,
    service_subcategory_id,
    pricing_model_id,
    execution_method_id,
    city_id,
    locality_id,
    pincode_id,
    locality,
    pincode,
    city,
    search,
    min_price,
    max_price,
    page = 1,
    limit = 20,
  } = query;

  const where = {
    is_deleted: false,
    is_available: true,
    moderation_status: 'approved',
  };

  if (category_id) where.category_id = category_id;
  if (service_subcategory_id) where.service_subcategory_id = service_subcategory_id;
  if (pricing_model_id) where.pricing_model_id = pricing_model_id;
  if (execution_method_id) where.execution_method_id = execution_method_id;

  if (min_price != null || max_price != null) {
    where.price = {};
    if (min_price != null) where.price[Op.gte] = min_price;
    if (max_price != null) where.price[Op.lte] = max_price;
  }

  if (search) {
    where[Op.or] = [
      { title: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
    ];
  }

  const offset = (page - 1) * limit;

  const { count, rows } = await ServiceListing.findAndCountAll({
    where,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    order: [['id', 'DESC']],
    include: [
      {
        model: ServiceProviderProfile,
        as: 'provider',
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'phone'] }]
      },
      ...listingMasterIncludes,
    ],
    distinct: true,
  });

  let filteredRows = rows;
  if (locality) {
    const locLower = locality.toLowerCase().trim();
    filteredRows = rows.filter((r) => {
      // 1. check provider profile service_area
      let sa = r.provider?.service_area;
      if (typeof sa === 'string') {
        try { sa = JSON.parse(sa); } catch (_) { sa = null; }
      }
      if (sa && Array.isArray(sa.localities)) {
        if (sa.localities.some(l => l.toLowerCase().includes(locLower))) return true;
      }
      // 2. check coverage_areas
      if (Array.isArray(r.coverage_areas)) {
        if (r.coverage_areas.some(ca => ca.locality?.name?.toLowerCase().includes(locLower) || ca.origin_address?.toLowerCase().includes(locLower))) {
          return true;
        }
      }
      return false;
    });
  }

  // Phase 9: Resident Society Service Discovery Enrichment
  if (query.society_id) {
    const socId = Number(query.society_id);
    const serviceIds = filteredRows.map(r => r.id);
    const accesses = await SocietyServiceAccess.findAll({
      where: {
        service_id: serviceIds,
        society_id: socId,
        is_deleted: false,
      },
      attributes: ['service_id', 'status'],
    });
    const accessMap = new Map(accesses.map(a => [Number(a.service_id), a.status]));

    filteredRows = filteredRows.map(r => {
      const accessStatus = accessMap.get(Number(r.id)) || 'NONE';
      const isApproved = accessStatus === 'APPROVED';
      const rowJson = r.toJSON ? r.toJSON() : { ...r };
      rowJson.society_access_status = accessStatus;
      rowJson.is_society_approved = isApproved;
      rowJson.is_bookable_for_society = isApproved;
      return rowJson;
    });
  }

  return {
    total: filteredRows.length,
    count: filteredRows.length,
    rows: filteredRows,
    data: filteredRows,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(filteredRows.length / limit),
  };
};

export const getMyListings = async (actorUserOrId) => {
  const actorId = (typeof actorUserOrId === 'object' && actorUserOrId !== null)
    ? (actorUserOrId.id || actorUserOrId.userId)
    : actorUserOrId;

  if (!actorId) return [];
  const profile = await ServiceProviderProfile.findOne({
    where: { user_id: actorId, is_deleted: false }
  });

  if (!profile) return [];

  return await ServiceListing.findAll({
    where: { provider_id: profile.id, is_deleted: false },
    order: [['id', 'DESC']],
    include: [
      { model: ServiceCategory, as: 'category' },
      { model: ServiceSubcategory, as: 'subcategory' },
      ...listingMasterIncludes,
    ]
  });
};

export const pauseListing = async (id, actorUser) => {
  return await updateListing(id, { is_available: false, moderation_status: 'paused' }, actorUser);
};

export const resumeListing = async (id, actorUser) => {
  return await updateListing(id, { is_available: true, moderation_status: 'approved' }, actorUser);
};

export const deleteListing = async (id, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = isGlobalAdminUser(actorUser);

  const listing = await ServiceListing.findOne({
    where: { id, is_deleted: false },
    include: [{ model: ServiceProviderProfile, as: 'provider' }]
  });

  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }

  if (!isAdmin && listing.provider?.user_id !== actorId) {
    const error = new Error('Forbidden: you do not have permission to delete this service listing');
    error.statusCode = 403;
    throw error;
  }

  const beforeSnapshot = listing.toJSON();
  await listing.update({
    is_deleted: true,
    deletedRemarks: 'Deleted by listing owner or administrator',
    updated_by: actorId,
  });

  // Soft-delete child coverage areas
  await ServiceCoverageArea.update(
    { is_deleted: true, deletedRemarks: 'Parent listing deleted', updated_by: actorId },
    { where: { service_id: id } }
  );

  await audit({
    actorId,
    action: 'service_listing.delete',
    targetType: 'service_listing',
    targetId: id,
    before: beforeSnapshot,
  });

  return { message: 'Service listing deleted successfully' };
};


// ═══════════════════════════════════════════════════════════════════════════════
// STEP 5: ENTERPRISE PORTFOLIO MEDIA & KYC METHODS
// ═══════════════════════════════════════════════════════════════════════════════

export const uploadServiceListingMedia = async (serviceId, actorUser, file, body = {}) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = isGlobalAdminUser(actorUser);

  const listing = await ServiceListing.findOne({
    where: { id: serviceId, is_deleted: false },
    include: [{ model: ServiceProviderProfile, as: 'provider' }]
  });

  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }

  let providerProfile = null;
  if (!isAdmin) {
    providerProfile = await getOrCreateProviderProfile(actorId);
    if (Number(listing.provider_id) !== Number(providerProfile.id)) {
      const error = new Error('Forbidden: you do not have permission to manage photos for this service listing');
      error.statusCode = 403;
      throw error;
    }
  }

  // Enforce Max 5 Active Photos SERVER-SIDE
  const activeCount = await ServiceListingMedia.count({
    where: {
      service_listing_id: listing.id,
      status: SERVICE_MEDIA_STATUS.ACTIVE,
      is_deleted: false,
    },
  });

  if (activeCount >= 5) {
    const error = new Error('Maximum 5 portfolio photos allowed per service listing. Please delete an existing photo before uploading a new one.');
    error.statusCode = 400;
    throw error;
  }

  let mediaUrl = null;
  let fileName = null;
  let fileSize = null;
  let mimeType = null;

  if (file) {
    mediaUrl = getImageUrl(null, file, 'services');
    fileName = file.filename || file.originalname;
    fileSize = file.size;
    mimeType = file.mimetype;
  } else if (body && body.media_url) {
    mediaUrl = String(body.media_url).trim();
    fileName = body.file_name || 'external_image';
  } else {
    const error = new Error('No photo file or valid media_url provided');
    error.statusCode = 400;
    throw error;
  }

  const isPrimary = activeCount === 0 || body.is_primary === true || body.is_primary === 'true';

  const mediaItem = await ServiceListingMedia.create({
    service_listing_id: listing.id,
    provider_id: listing.provider_id,
    media_url: mediaUrl,
    media_type: body.media_type || 'image',
    file_name: fileName,
    file_size: fileSize,
    mime_type: mimeType,
    display_order: Number(body.display_order) || (activeCount + 1),
    is_primary: isPrimary,
    status: SERVICE_MEDIA_STATUS.ACTIVE,
    is_active: true,
    is_deleted: false,
    created_by: actorId,
  });

  // Synchronize service_listings.images JSON array cache
  const activeMedia = await ServiceListingMedia.findAll({
    where: { service_listing_id: listing.id, status: SERVICE_MEDIA_STATUS.ACTIVE, is_deleted: false },
    order: [['display_order', 'ASC'], ['id', 'ASC']],
  });
  const imageUrls = activeMedia.map((m) => m.media_url);
  await listing.update({ images: imageUrls, updatedAt: new Date() });

  await audit({
    actorId,
    action: 'SERVICE_MEDIA_UPLOADED',
    targetType: 'service_listing_media',
    targetId: mediaItem.id,
    after: {
      service_listing_id: listing.id,
      media_url: mediaUrl,
      display_order: mediaItem.display_order,
    },
  });

  return mediaItem;
};

export const getServiceListingMedia = async (serviceId, actorUser) => {
  const listing = await ServiceListing.findOne({
    where: { id: serviceId, is_deleted: false },
  });

  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }

  const media = await ServiceListingMedia.findAll({
    where: {
      service_listing_id: serviceId,
      status: SERVICE_MEDIA_STATUS.ACTIVE,
      is_deleted: false,
    },
    order: [['display_order', 'ASC'], ['id', 'ASC']],
  });

  return media;
};

export const deleteServiceListingMedia = async (serviceId, mediaId, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = isGlobalAdminUser(actorUser);

  const listing = await ServiceListing.findOne({
    where: { id: serviceId, is_deleted: false },
    include: [{ model: ServiceProviderProfile, as: 'provider' }]
  });

  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }

  let providerProfile = null;
  if (!isAdmin) {
    providerProfile = await getOrCreateProviderProfile(actorId);
    if (Number(listing.provider_id) !== Number(providerProfile.id)) {
      const error = new Error('Forbidden: you do not have permission to delete photos for this service listing');
      error.statusCode = 403;
      throw error;
    }
  }

  const mediaItem = await ServiceListingMedia.findOne({
    where: {
      id: mediaId,
      service_listing_id: serviceId,
      is_deleted: false,
    },
  });

  if (!mediaItem) {
    const error = new Error('Media item not found');
    error.statusCode = 404;
    throw error;
  }

  if (!isAdmin && Number(mediaItem.provider_id) !== Number(providerProfile.id)) {
    const error = new Error('Forbidden: you do not have permission to delete this photo');
    error.statusCode = 403;
    throw error;
  }

  const beforeUrl = mediaItem.media_url;
  await mediaItem.update({
    status: SERVICE_MEDIA_STATUS.DELETED,
    is_deleted: true,
    deletedRemarks: 'Deleted by provider or administrator',
    updated_by: actorId,
    updatedAt: new Date(),
  });

  // Safely clean up local storage file if present
  try {
    await removeLocalUpload(beforeUrl);
  } catch (_) {}

  // Synchronize service_listings.images JSON cache
  const activeMedia = await ServiceListingMedia.findAll({
    where: { service_listing_id: listing.id, status: SERVICE_MEDIA_STATUS.ACTIVE, is_deleted: false },
    order: [['display_order', 'ASC'], ['id', 'ASC']],
  });
  const imageUrls = activeMedia.map((m) => m.media_url);
  await listing.update({ images: imageUrls, updatedAt: new Date() });

  await audit({
    actorId,
    action: 'SERVICE_MEDIA_DELETED',
    targetType: 'service_listing_media',
    targetId: mediaId,
    before: { service_listing_id: serviceId, media_url: beforeUrl },
  });

  return { message: 'Portfolio photo deleted successfully' };
};

export const getServiceListingKycStatus = async (serviceId, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = isGlobalAdminUser(actorUser);

  const listing = await ServiceListing.findOne({
    where: { id: serviceId, is_deleted: false },
    include: [
      { model: ServiceProviderProfile, as: 'provider' },
      { model: ServiceCategory, as: 'category' },
    ]
  });

  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }

  let providerProfile = null;
  if (!isAdmin) {
    providerProfile = await getOrCreateProviderProfile(actorId);
    if (Number(listing.provider_id) !== Number(providerProfile.id)) {
      const error = new Error('Forbidden: you do not have permission to inspect KYC status for this service listing');
      error.statusCode = 403;
      throw error;
    }
  }

  const targetProfile = listing.provider || providerProfile;
  const rawStatus = targetProfile.verification_status || 'notSubmitted';
  const isVerified = Boolean(targetProfile.is_verified && rawStatus === 'verified');

  // Authoritative document state mapping
  let mappedDocStatus = 'NOT_UPLOADED';
  if (rawStatus === 'verified') mappedDocStatus = 'VERIFIED';
  else if (rawStatus === 'underReview') mappedDocStatus = 'UNDER_REVIEW';
  else if (rawStatus === 'rejected') mappedDocStatus = 'REJECTED';
  else if (rawStatus === 'actionRequired') mappedDocStatus = 'RESUBMISSION_REQUIRED';

  const documents = [
    {
      code: 'BUSINESS_LICENSE',
      title: 'Business License',
      status: mappedDocStatus,
      is_required: true,
      description: 'Official commercial registration or municipal trade license',
    },
    {
      code: 'QUALIFICATION_CERTIFICATE',
      title: 'Qualification Certificate',
      status: mappedDocStatus,
      is_required: true,
      description: 'Government/Trade council verified technical qualification certificate',
    },
    {
      code: 'INSURANCE_DOCUMENT',
      title: 'Insurance Document',
      status: mappedDocStatus,
      is_required: false,
      description: 'Active commercial general liability and indemnity insurance',
    },
  ];

  return {
    service_id: Number(listing.id),
    provider_id: Number(targetProfile.id),
    provider_verification_status: rawStatus.toUpperCase(),
    is_provider_verified: isVerified,
    category_id: listing.category_id,
    category_name: listing.category?.serviceCategoryName || 'General',
    is_eligible_for_publish: isVerified,
    documents,
  };
};

export const submitServiceListingForReview = async (serviceId, actorUser) => {
  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = isGlobalAdminUser(actorUser);

  const listing = await ServiceListing.findOne({
    where: { id: serviceId, is_deleted: false },
    include: [
      { model: ServiceProviderProfile, as: 'provider' },
      { model: ServiceCategory, as: 'category' },
    ]
  });

  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }

  let providerProfile = null;
  if (!isAdmin) {
    providerProfile = await getOrCreateProviderProfile(actorId);
    if (Number(listing.provider_id) !== Number(providerProfile.id)) {
      const error = new Error('Forbidden: you do not have permission to submit this service listing');
      error.statusCode = 403;
      throw error;
    }
  }

  const targetProfile = listing.provider || providerProfile;

  // 1. Provider is active & not deleted
  if (targetProfile.is_deleted || targetProfile.is_active === false) {
    const error = new Error('Service Provider account is inactive. Cannot submit services.');
    error.statusCode = 400;
    throw error;
  }

  // 2. Authoritative Provider KYC verification status check
  if (!targetProfile.is_verified || targetProfile.verification_status !== 'verified') {
    const statusLabel = targetProfile.verification_status || 'notSubmitted';
    await audit({
      actorId,
      action: 'SERVICE_KYC_VALIDATION_FAILED',
      targetType: 'service_listing',
      targetId: listing.id,
      after: { reason: 'Provider KYC not verified', verification_status: statusLabel },
    });
    const error = new Error(`Cannot submit service for review: Provider KYC verification required (current status: ${statusLabel}).`);
    error.statusCode = 400;
    throw error;
  }

  // 3. Trade Category Authorization Check
  if (targetProfile.service_category_id && listing.category_id) {
    if (Number(targetProfile.service_category_id) !== Number(listing.category_id)) {
      const error = new Error('Unauthorized category: provider is not verified for this service category');
      error.statusCode = 403;
      throw error;
    }
  }

  // 4. Portfolio Photos count check
  const activePhotosCount = await ServiceListingMedia.count({
    where: {
      service_listing_id: listing.id,
      status: SERVICE_MEDIA_STATUS.ACTIVE,
      is_deleted: false,
    },
  });

  if (activePhotosCount > 5) {
    const error = new Error(`Maximum 5 portfolio photos allowed (current count: ${activePhotosCount})`);
    error.statusCode = 400;
    throw error;
  }

  // 5. Update Listing: If provider is verified, approve immediately for customer marketplace
  const beforeStatus = listing.moderation_status;
  const isVerifiedProvider = Boolean(targetProfile.is_verified);
  const targetStatus = isVerifiedProvider ? 'approved' : 'pending';

  await listing.update({
    moderation_status: targetStatus,
    is_available: true,
    updated_by: actorId,
    updatedAt: new Date(),
  });

  // 6. Audit Trail
  await audit({
    actorId,
    action: 'SERVICE_SUBMITTED',
    targetType: 'service_listing',
    targetId: listing.id,
    before: { moderation_status: beforeStatus },
    after: { moderation_status: 'pending' },
  });

  // 7. Notification (actorId: null ensures system dispatch without self-suppression)
  if (targetProfile.user_id) {
    await emitNotification({
      recipientId: targetProfile.user_id,
      actorId: null,
      type: 'info',
      title: 'Service Listing Submitted',
      message: `Your service "${listing.title}" was submitted for review.`,
      data: { serviceId: listing.id, status: 'pending' },
      preferenceKey: 'booking_requests',
      sendPush: true,
    });
  }

  return listing;
};


/**
 * Admin Service: Get all listings across all providers and statuses with filters and pagination
 */
export const getAdminAllListings = async (query = {}) => {
  const {
    moderation_status,
    category_id,
    is_available,
    search,
    page = 1,
    limit = 20,
    sort_order = 'DESC',
  } = query;

  const where = {
    is_deleted: false,
  };

  if (moderation_status && moderation_status !== 'all') {
    where.moderation_status = moderation_status;
  }
  if (category_id) {
    where.category_id = category_id;
  }
  if (is_available !== undefined && is_available !== '') {
    where.is_available = String(is_available) === 'true';
  }
  if (search) {
    where[Op.or] = [
      { title: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
    ];
  }

  const offset = (Number(page) - 1) * Number(limit);

  const { count, rows } = await ServiceListing.findAndCountAll({
    where,
    include: [
      {
        model: ServiceProviderProfile,
        as: 'provider',
        include: [{ model: User, as: 'user', attributes: ['userId', 'userName', 'phone', 'email'] }],
      },
      ...listingMasterIncludes,
      {
        model: ServiceListingMedia,
        as: 'media_items',
        where: { is_deleted: false },
        required: false,
      },
    ],
    order: [['id', String(sort_order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC']],
    limit: Number(limit),
    offset,
    distinct: true,
  });

  return {
    total: count,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(count / Number(limit)),
    listings: rows,
  };
};

/**
 * Admin Service: Bulk soft delete service listings
 */
export const bulkSoftDeleteListings = async (ids, deletedRemarks = '', updated_by = null) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) return { affected: 0 };
  const [affected] = await ServiceListing.update(
    {
      is_deleted: true,
      is_available: false,
      moderation_status: 'deleted',
      moderation_remarks: deletedRemarks || 'Bulk deleted by administrator',
      updated_by,
      updatedAt: new Date(),
    },
    {
      where: {
        id: { [Op.in]: ids },
        is_deleted: false,
      },
    }
  );
  return { affected };
};

/**
 * Admin Service: One-click toggle availability status
 */
export const adminToggleListingStatus = async (id, isAvailable, actorId) => {
  const listing = await ServiceListing.findOne({ where: { id, is_deleted: false } });
  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }
  await listing.update({
    is_available: Boolean(isAvailable),
    updated_by: actorId,
    updatedAt: new Date(),
  });
  return await getListingById(id);
};
