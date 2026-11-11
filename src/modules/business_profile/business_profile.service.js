import { Op, fn, col, literal } from 'sequelize';
import sequelize from '../../config/db.js';
import BusinessProfile from './business_profile.model.js';
import BusinessCoverageArea from './business_coverage_area.model.js';
import SocietyBusinessAccess from './society_business_access.model.js';
import BusinessCategory from '../business_category/business_category.model.js';
import BusinessProduct from '../business_product/business_product.model.js';
import BusinessOffer from '../business_offer/business_offer.model.js';
import BusinessReview from '../business_review/business_review.model.js';
import { State, District } from '../location_master/location_master.models.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import businessCoverageService from './business_coverage.service.js';
import { fetchFollowStatsByBusinessIds } from './business_follow.service.js';
import {
  normalizeText,
  resolveCategoryFromMaster,
  resolveFilterTarget,
  productMatchesCategoryFilter,
  businessMatchesOwnCategory,
  scoreProductSearch,
  scoreBusinessSearch,
  computeDidYouMean,
  buildEffectiveSynonymDictionaries,
} from '../business_category/category_matcher.helper.js';
import {
  getDynamicSynonymConfig,
  buildGeoBoundingBoxWhere,
  getCachedSearchPayload,
  setCachedSearchPayload,
  invalidateSearchQueryCache,
  logSearchEvent,
} from '../business_category/business_search_intelligence.service.js';

const fetchProductCapabilitiesByBusinessIds = async (businessIds = []) => {
  if (!Array.isArray(businessIds) || businessIds.length === 0) return {};
  const rows = await BusinessProduct.findAll({
    attributes: [
      'business_id',
      [fn('COUNT', col('id')), 'cnt'],
      [fn('SUM', literal('CASE WHEN home_delivery = 1 THEN 1 ELSE 0 END')), 'del_cnt'],
      [fn('SUM', literal('CASE WHEN store_pickup = 1 THEN 1 ELSE 0 END')), 'pick_cnt'],
    ],
    where: {
      business_id: { [Op.in]: businessIds },
      status: 'active',
      approval_status: 'approved',
      is_deleted: false,
    },
    group: ['business_id'],
    raw: true,
  });
  return Object.fromEntries(
    rows.map((r) => {
      const total = Number(r.cnt || 0);
      const delCnt = Number(r.del_cnt || 0);
      const pickCnt = Number(r.pick_cnt || 0);
      return [
        Number(r.business_id),
        {
          product_count: total,
          delivery_product_count: delCnt,
          pickup_product_count: pickCnt,
          supports_home_delivery: delCnt > 0,
          supports_store_pickup: pickCnt > 0,
        },
      ];
    })
  );
};

const fetchOfferCountsByBusinessIds = async (businessIds = []) => {
  if (!Array.isArray(businessIds) || businessIds.length === 0) return {};
  const rows = await BusinessOffer.findAll({
    attributes: ['business_id', [fn('COUNT', col('id')), 'cnt']],
    where: {
      business_id: { [Op.in]: businessIds },
      is_active: true,
      is_deleted: false,
    },
    group: ['business_id'],
    raw: true,
  });
  return Object.fromEntries(rows.map((r) => [Number(r.business_id), Number(r.cnt || 0)]));
};

const fetchReviewStatsByBusinessIds = async (businessIds = []) => {
  if (!Array.isArray(businessIds) || businessIds.length === 0) return {};
  const rows = await BusinessReview.findAll({
    attributes: [
      'business_id',
      [fn('COUNT', col('id')), 'cnt'],
      [fn('AVG', col('rating')), 'avg_rating'],
    ],
    where: {
      business_id: { [Op.in]: businessIds },
      is_deleted: false,
    },
    group: ['business_id'],
    raw: true,
  });
  return Object.fromEntries(
    rows.map((r) => {
      const count = Number(r.cnt || 0);
      const avg = count > 0 && r.avg_rating != null ? Number(Number(r.avg_rating).toFixed(1)) : null;
      return [Number(r.business_id), { rating: avg, review_count: count }];
    })
  );
};

const toNullableFloat = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toNullableInt = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toBool = (v, fallback = false) => {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = v.toString().trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
};

/**
 * Normalize BusinessProfile payload fields from either camelCase or snake_case.
 */
const normalizeProfileInput = async (raw = {}, isUpdate = false) => {
  const mapped = {};

  if (raw.userId !== undefined || raw.user_id !== undefined) {
    mapped.userId = toNullableInt(raw.userId ?? raw.user_id);
  }
  if (raw.businessName !== undefined || raw.business_name !== undefined) {
    mapped.businessName = (raw.businessName ?? raw.business_name)?.toString().trim() || null;
  }
  if (raw.category_id !== undefined || raw.categoryId !== undefined) {
    mapped.category_id = toNullableInt(raw.category_id ?? raw.categoryId);
  }
  if (raw.serviceCategory !== undefined || raw.service_category !== undefined || raw.category_name !== undefined) {
    mapped.serviceCategory =
      (raw.serviceCategory ?? raw.service_category ?? raw.category_name)?.toString().trim() || null;
  }
  if (raw.description !== undefined) mapped.description = raw.description;
  if (raw.address !== undefined) mapped.address = raw.address;
  if (raw.phone !== undefined) mapped.phone = raw.phone;
  if (raw.email !== undefined) mapped.email = raw.email;
  if (raw.website !== undefined) mapped.website = raw.website;

  if (raw.logo_url !== undefined || raw.logoUrl !== undefined || raw.logo !== undefined) {
    mapped.logo_url = raw.logo_url ?? raw.logoUrl ?? raw.logo ?? null;
  }
  if (raw.bannerUrl !== undefined || raw.banner_url !== undefined) {
    mapped.bannerUrl = raw.bannerUrl ?? raw.banner_url ?? null;
  }
  if (raw.operatingHours !== undefined || raw.operating_hours !== undefined) {
    mapped.operatingHours = raw.operatingHours ?? raw.operating_hours ?? null;
  }
  if (raw.hourlyRate !== undefined || raw.hourly_rate !== undefined) {
    mapped.hourlyRate = toNullableFloat(raw.hourlyRate ?? raw.hourly_rate);
  }
  if (raw.availabilityDays !== undefined || raw.availability_days !== undefined) {
    mapped.availabilityDays = raw.availabilityDays ?? raw.availability_days ?? null;
  }

  // Location fields check
  const hasAnyLocField = [
    'state_id',
    'stateId',
    'district_id',
    'districtId',
    'city_id',
    'cityId',
    'city_name',
    'city',
    'locality_id',
    'localityId',
    'locality_name',
    'locality',
    'pincode_id',
    'pincodeId',
    'pincode',
    'society_id',
    'societyId',
    'latitude',
    'longitude',
  ].some((k) => raw[k] !== undefined);

  if (hasAnyLocField || !isUpdate) {
    const locResolved = await businessCoverageService.resolveLocationNames({
      state_id: raw.state_id ?? raw.stateId,
      district_id: raw.district_id ?? raw.districtId,
      city_id: raw.city_id ?? raw.cityId,
      city_name: raw.city_name ?? raw.city,
      locality_id: raw.locality_id ?? raw.localityId,
      locality_name: raw.locality_name ?? raw.locality,
      pincode_id: raw.pincode_id ?? raw.pincodeId,
      pincode: raw.pincode,
      society_id: raw.society_id ?? raw.societyId,
      latitude: raw.latitude,
      longitude: raw.longitude,
    });

    Object.assign(mapped, locResolved);
  }

  if (raw.coverage_scope !== undefined || raw.coverageScope !== undefined) {
    mapped.coverage_scope = (raw.coverage_scope ?? raw.coverageScope ?? 'PUBLIC')
      .toString()
      .trim()
      .toUpperCase();
  } else if (!isUpdate) {
    mapped.coverage_scope = 'PUBLIC';
  }

  if (raw.default_radius_km !== undefined || raw.defaultRadiusKm !== undefined || raw.radius_km !== undefined) {
    mapped.default_radius_km =
      toNullableFloat(raw.default_radius_km ?? raw.defaultRadiusKm ?? raw.radius_km) ?? 10.0;
  } else if (!isUpdate) {
    mapped.default_radius_km = 10.0;
  }

  if (raw.is_verified !== undefined || raw.isVerified !== undefined) {
    mapped.is_verified = toBool(raw.is_verified ?? raw.isVerified, false);
  }
  if (raw.is_featured !== undefined || raw.isFeatured !== undefined) {
    mapped.is_featured = toBool(raw.is_featured ?? raw.isFeatured, false);
  }
  if (raw.is_open !== undefined || raw.isOpen !== undefined) {
    mapped.is_open = toBool(raw.is_open ?? raw.isOpen, true);
  } else if (!isUpdate) {
    mapped.is_open = true;
  }

  if (raw.is_active !== undefined || raw.isActive !== undefined) {
    mapped.is_active = toBool(raw.is_active ?? raw.isActive, true);
  } else if (!isUpdate) {
    mapped.is_active = true;
  }

  if (raw.created_by !== undefined) mapped.created_by = toNullableInt(raw.created_by);
  if (raw.updated_by !== undefined) mapped.updated_by = toNullableInt(raw.updated_by);

  // If category_id was sent without serviceCategory string, hydrate category name
  if (mapped.category_id && !mapped.serviceCategory) {
    const cat = await BusinessCategory.findByPk(mapped.category_id);
    if (cat) mapped.serviceCategory = cat.name;
  }

  return mapped;
};

/**
 * Format BusinessProfile instance consistently with both snake_case and camelCase keys.
 */
export const formatBusinessProfile = (instance, extras = {}) => {
  if (!instance) return null;
  const p = instance.toJSON ? instance.toJSON() : { ...instance };

  const lat = p.latitude !== null && p.latitude !== undefined ? Number(p.latitude) : null;
  const lng = p.longitude !== null && p.longitude !== undefined ? Number(p.longitude) : null;
  const coverageAreas = Array.isArray(p.coverageAreas)
    ? p.coverageAreas
    : Array.isArray(extras.coverage_areas)
      ? extras.coverage_areas
      : [];
  const societyAccesses = Array.isArray(p.societyAccesses)
    ? p.societyAccesses
    : Array.isArray(extras.society_accesses)
      ? extras.society_accesses
      : [];

  return {
    id: p.id,
    user_id: p.userId ?? p.user_id ?? null,
    userId: p.userId ?? p.user_id ?? null,
    business_name: p.businessName ?? p.business_name ?? null,
    businessName: p.businessName ?? p.business_name ?? null,
    category_id: p.category_id ?? null,
    serviceCategory: p.serviceCategory ?? p.category?.name ?? null,
    category_name: p.category?.name ?? p.serviceCategory ?? null,
    category: p.category || null,
    description: p.description ?? null,
    address: p.address ?? null,
    phone: p.phone ?? null,
    email: p.email ?? null,
    website: p.website ?? null,
    logo_url: p.logo_url ?? null,
    logo: p.logo_url ?? null,
    banner_url: p.bannerUrl ?? null,
    bannerUrl: p.bannerUrl ?? null,
    operating_hours: p.operatingHours ?? null,
    operatingHours: p.operatingHours ?? null,
    hourly_rate: p.hourlyRate !== null && p.hourlyRate !== undefined ? Number(p.hourlyRate) : null,
    availability_days: p.availabilityDays ?? null,
    state_id: p.state_id ?? null,
    state_name: extras.state_name ?? p.state_name ?? null,
    district_id: p.district_id ?? null,
    district_name: extras.district_name ?? p.district_name ?? null,
    city_id: p.city_id ?? null,
    city_name: p.city_name ?? null,
    locality_id: p.locality_id ?? null,
    locality_name: p.locality_name ?? null,
    pincode_id: p.pincode_id ?? null,
    pincode: p.pincode ?? null,
    society_id: p.society_id ?? null,
    society_name: extras.society_name ?? p.society_name ?? null,
    latitude: lat,
    longitude: lng,
    coverage_scope: p.coverage_scope || 'PUBLIC',
    default_radius_km:
      p.default_radius_km !== null && p.default_radius_km !== undefined
        ? Number(p.default_radius_km)
        : 10.0,
    is_verified: Boolean(p.is_verified),
    approval_status: Boolean(p.is_verified) ? 'approved' : (p.remark ? 'rejected' : 'pending'),
    is_featured: Boolean(p.is_featured),
    is_open: p.is_open !== undefined ? Boolean(p.is_open) : true,
    is_active: p.is_active !== undefined ? Boolean(p.is_active) : true,
    owner_name: extras.owner_name ?? p.user?.userName ?? null,
    rating: extras.rating !== undefined ? extras.rating : (p.rating ?? null),
    review_count: extras.review_count !== undefined ? extras.review_count : (p.review_count ?? 0),
    reviewCount: extras.review_count !== undefined ? extras.review_count : (p.review_count ?? 0),
    rating_breakdown: extras.rating_breakdown ?? null,
    is_deliverable: extras.is_deliverable !== undefined ? Boolean(extras.is_deliverable) : true,
    supports_home_delivery: Boolean(extras.supports_home_delivery ?? p.supports_home_delivery ?? false),
    delivery_available: Boolean(extras.supports_home_delivery ?? p.supports_home_delivery ?? false),
    supports_store_pickup: Boolean(extras.supports_store_pickup ?? p.supports_store_pickup ?? false),
    store_pickup: Boolean(extras.supports_store_pickup ?? p.supports_store_pickup ?? false),
    delivery_product_count: Number(extras.delivery_product_count ?? 0),
    pickup_product_count: Number(extras.pickup_product_count ?? 0),
    follower_count: Number(extras.follower_count ?? 0),
    is_following: Boolean(extras.is_following ?? false),
    active_offer_count: Number(extras.active_offer_count ?? 0),
    coverage_areas: coverageAreas,
    society_accesses: societyAccesses,
    distance_km: extras.distance_km ?? null,
    distance: extras.distance ?? null,
    matched_by: extras.matched_by ?? null,
    society_access_status: extras.society_access_status ?? null,
    product_count: extras.product_count ?? p.product_count ?? 0,
    matching_product_count: extras.matching_product_count ?? null,
    selling_categories: Array.isArray(extras.selling_categories) ? extras.selling_categories : [],
    relevance_score: extras.relevance_score ?? null,
    matched_via_typo: extras.matched_via_typo ?? false,
    created_at: p.created_at ?? null,
    updatedAt: p.updatedAt ?? null,
  };
};

const parseCoverageAreasInput = (raw) => {
  let areas = raw.coverage_areas ?? raw.coverageAreas;
  if (typeof areas === 'string') {
    try {
      areas = JSON.parse(areas);
    } catch (_) {
      areas = null;
    }
  }
  return Array.isArray(areas) ? areas : null;
};

const buildDefaultCoverageAreas = (mapped) => {
  const areas = [];
  const scope = mapped.coverage_scope || 'PUBLIC';

  if (scope === 'SOCIETY' && mapped.society_id) {
    areas.push({
      coverage_scope: 'SOCIETY',
      coverage_method: 'SOCIETY',
      society_id: mapped.society_id,
      state_id: mapped.state_id,
      district_id: mapped.district_id,
      city_id: mapped.city_id,
      city_name: mapped.city_name,
      origin_latitude: mapped.latitude,
      origin_longitude: mapped.longitude,
      origin_address: mapped.address,
      resolved_radius_km: mapped.default_radius_km ?? 5.0,
      display_order: 0,
    });
    return areas;
  }

  if (mapped.latitude !== null && mapped.longitude !== null) {
    areas.push({
      coverage_scope: scope,
      coverage_method: 'RADIUS',
      state_id: mapped.state_id,
      district_id: mapped.district_id,
      city_id: mapped.city_id,
      city_name: mapped.city_name,
      locality_id: mapped.locality_id,
      locality_name: mapped.locality_name,
      pincode_id: mapped.pincode_id,
      pincode: mapped.pincode,
      origin_latitude: mapped.latitude,
      origin_longitude: mapped.longitude,
      origin_address: mapped.address,
      resolved_radius_km: mapped.default_radius_km ?? 10.0,
      display_order: 0,
    });
  }

  if (mapped.city_id || mapped.city_name) {
    areas.push({
      coverage_scope: scope === 'SOCIETY_AND_PUBLIC' ? 'SOCIETY_AND_PUBLIC' : 'PUBLIC',
      coverage_method: 'CITY',
      state_id: mapped.state_id,
      district_id: mapped.district_id,
      city_id: mapped.city_id,
      city_name: mapped.city_name,
      display_order: areas.length,
    });
  }

  if (mapped.society_id && scope === 'SOCIETY_AND_PUBLIC') {
    areas.push({
      coverage_scope: 'SOCIETY_AND_PUBLIC',
      coverage_method: 'SOCIETY',
      society_id: mapped.society_id,
      display_order: areas.length,
    });
  }

  return areas;
};

export const createProfile = async (profileData) => {
  const mapped = await normalizeProfileInput(profileData, false);
  const explicitAreas = parseCoverageAreasInput(profileData);
  const actorId = mapped.created_by || mapped.userId || null;

  const createdId = await sequelize.transaction(async (t) => {
    const profile = await BusinessProfile.create(
      {
        ...mapped,
        created_at: new Date(),
        updatedAt: new Date(),
      },
      { transaction: t }
    );

    const areasToPersist =
      explicitAreas && explicitAreas.length > 0 ? explicitAreas : buildDefaultCoverageAreas(mapped);

    if (areasToPersist.length > 0) {
      await businessCoverageService.upsertBusinessCoverageAreas(profile.id, areasToPersist, {
        profileDefaults: mapped,
        actorUserId: actorId,
        transaction: t,
      });
    }

    return profile.id;
  });

  invalidateSearchQueryCache().catch(() => {});
  return getProfileById(createdId);
};

export const resolvePinLocation = async (query = {}) => {
  const lat = query.latitude ?? query.lat;
  const lng = query.longitude ?? query.lng ?? query.lon;
  return businessCoverageService.resolveCoordinatesContext(lat, lng);
};

export const getNearbyBusinesses = async (query = {}) => {
  const startedAt = Date.now();
  const loc = businessCoverageService.parseLocationQuery(query);
  const where = { is_deleted: false };
  const searchTerm = (query.search ?? query.q ?? '').toString().trim();
  const shouldLog =
    Boolean(searchTerm) && query.skip_log !== 'true' && query._skipLog !== true;

  if (query.is_active !== undefined) {
    where.is_active = toBool(query.is_active, true);
  } else {
    where.is_active = true;
  }

  if (query.is_verified !== undefined) {
    where.is_verified = toBool(query.is_verified);
  } else if (!toBool(query.include_unverified, false)) {
    // Public resident discovery only lists verified/approved active shops by default
    where.is_verified = true;
  }
  if (query.is_featured !== undefined) {
    where.is_featured = toBool(query.is_featured);
  }
  if (query.is_open !== undefined) {
    where.is_open = toBool(query.is_open);
  }

  const geoBBox = buildGeoBoundingBoxWhere(loc);
  if (geoBBox) {
    Object.assign(where, geoBBox);
  }

  let cacheEntryKey = null;
  if (!query._skipCache) {
    const cacheRes = await getCachedSearchPayload('businesses_nearby', {
      viewer: query._viewerUserId || 'anon',
      lat: loc.latitude,
      lng: loc.longitude,
      rad: loc.radius_km,
      cid: loc.city_id,
      cname: loc.city_name,
      lid: loc.locality_id,
      lname: loc.locality_name,
      pin: loc.pincode,
      soc: loc.society_id,
      catId: query.category_id,
      cat: query.category,
      q: normalizeText(searchTerm),
      ver: where.is_verified,
      act: where.is_active,
      open: query.is_open,
      feat: query.is_featured,
      del: query.home_delivery,
      pick: query.store_pickup,
      sort: query.sort || (searchTerm ? 'relevance' : 'distance'),
      page: query.page || 1,
      limit: query.limit || 50,
    });
    cacheEntryKey = cacheRes.key;
    if (cacheRes.cached) {
      if (shouldLog) {
        logSearchEvent({
          query: searchTerm,
          categoryId: query.category_id ? Number(query.category_id) : null,
          categoryName: query.category || null,
          businessResultCount: Number(cacheRes.cached.total || 0),
          matchedViaTypo: Boolean(cacheRes.cached.search_meta?.matched_via_typo),
          didYouMean: cacheRes.cached.search_meta?.did_you_mean || null,
          latencyMs: Date.now() - startedAt,
          locationContext: loc,
          userId: query._viewerUserId || null,
          source: query.source || 'resident_search',
        }).catch(() => {});
      }
      return cacheRes.cached;
    }
  }

  const [categoryMaster, dynamicSynonyms, profiles] = await Promise.all([
    BusinessCategory.findAll({
      where: { is_deleted: false },
      attributes: ['id', 'name'],
      raw: true,
    }),
    getDynamicSynonymConfig(),
    BusinessProfile.findAll({
      where,
      include: [
        { model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'], required: false },
        {
          model: BusinessCoverageArea,
          as: 'coverageAreas',
          where: { is_deleted: false, is_active: true },
          required: false,
        },
        {
          model: SocietyBusinessAccess,
          as: 'societyAccesses',
          where: { is_deleted: false },
          required: false,
        },
      ],
      order: [
        ['is_featured', 'DESC'],
        ['created_at', 'DESC'],
      ],
    }),
  ]);
  const filterTarget = resolveFilterTarget(
    query.category_id,
    query.category,
    categoryMaster,
    dynamicSynonyms
  );

  const ids = profiles.map((p) => p.id);
  let productCaps = {};
  let reviewStatsMap = {};
  let followStatsMap = {};
  let offerCountMap = {};
  const productsByBusinessId = new Map();
  if (ids.length > 0) {
    const [pCaps, revStats, folStats, offCounts, activeProducts] = await Promise.all([
      fetchProductCapabilitiesByBusinessIds(ids),
      fetchReviewStatsByBusinessIds(ids),
      fetchFollowStatsByBusinessIds(ids, query._viewerUserId || null),
      fetchOfferCountsByBusinessIds(ids),
      BusinessProduct.findAll({
        attributes: [
          'id',
          'business_id',
          'name',
          'brand',
          'category_id',
          'category_name',
          'subcategory_name',
          'sku',
          'short_description',
          'tags',
          'search_keywords',
          'attributes',
          'is_bestseller',
          'is_featured',
          'stock_status',
        ],
        where: {
          business_id: { [Op.in]: ids },
          status: 'active',
          approval_status: 'approved',
          is_deleted: false,
        },
        raw: true,
      }),
    ]);
    productCaps = pCaps;
    reviewStatsMap = revStats;
    followStatsMap = folStats;
    offerCountMap = offCounts;
    for (const prod of activeProducts) {
      const bId = Number(prod.business_id);
      if (!productsByBusinessId.has(bId)) productsByBusinessId.set(bId, []);
      productsByBusinessId.get(bId).push(prod);
    }
  }

  const filterHomeDelivery = query.home_delivery !== undefined ? toBool(query.home_delivery) : null;
  const filterStorePickup = query.store_pickup !== undefined ? toBool(query.store_pickup) : null;

  const vocabSet = new Set();
  const { aliasToCanonical } = buildEffectiveSynonymDictionaries(dynamicSynonyms);
  for (const cat of categoryMaster) vocabSet.add(normalizeText(cat.name));
  for (const aliasWord of Object.keys(aliasToCanonical)) {
    for (const w of aliasWord.split(' ')) {
      if (w.length >= 4) vocabSet.add(w);
    }
  }

  const typoCorrections = {};
  let anyMatchedViaTypo = false;
  const matchedItems = [];

  for (const inst of profiles) {
    const plain = inst.toJSON();
    const evalResult = businessCoverageService.evaluateBusinessMatch(
      plain,
      plain.coverageAreas || [],
      plain.societyAccesses || [],
      loc
    );
    if (!evalResult.matched) continue;

    for (const w of normalizeText(plain.businessName).split(' ')) {
      if (w.length >= 4) vocabSet.add(w);
    }

    const pCap = productCaps[Number(plain.id)] || {};
    const supportsDelivery = Boolean(pCap.supports_home_delivery);
    const supportsPickup = Boolean(pCap.supports_store_pickup);
    if (filterHomeDelivery === true && !supportsDelivery) continue;
    if (filterStorePickup === true && !supportsPickup) continue;

    const shopProducts = productsByBusinessId.get(Number(plain.id)) || [];
    const sellingCatsSet = new Set();
    for (const sp of shopProducts) {
      const resCat = resolveCategoryFromMaster(
        sp.category_id,
        sp.category_name,
        categoryMaster,
        dynamicSynonyms
      );
      const label = resCat.master_category_name || resCat.category_name;
      if (label) sellingCatsSet.add(label);
      for (const w of normalizeText(`${sp.name || ''} ${sp.brand || ''}`).split(' ')) {
        if (w.length >= 4) vocabSet.add(w);
      }
    }
    const sellingCategories = Array.from(sellingCatsSet);

    let matchingProductCount = null;
    let relevanceScore = 0;
    let shopMatchedViaTypo = false;

    if (filterTarget || searchTerm) {
      const ownCatMatches = filterTarget
        ? businessMatchesOwnCategory(plain, filterTarget, categoryMaster, dynamicSynonyms)
        : true;
      const shopScoreEval = searchTerm
        ? scoreBusinessSearch(
            { ...plain, distance_km: evalResult.distance_km },
            searchTerm,
            categoryMaster,
            dynamicSynonyms
          )
        : { matched: true, score: 0, matchedViaTypo: false, typoCorrections: {} };

      let bestProdScore = 0;
      const matchingProducts = [];
      for (const prod of shopProducts) {
        if (
          filterTarget &&
          !productMatchesCategoryFilter(prod, filterTarget, categoryMaster, dynamicSynonyms)
        ) {
          continue;
        }
        if (searchTerm) {
          const ps = scoreProductSearch(
            prod,
            { business_name: plain.businessName, locality_name: plain.locality_name, distance_km: evalResult.distance_km },
            searchTerm,
            categoryMaster,
            dynamicSynonyms
          );
          if (!ps.matched) continue;
          if (ps.score > bestProdScore) bestProdScore = ps.score;
          if (ps.matchedViaTypo) {
            shopMatchedViaTypo = true;
            Object.assign(typoCorrections, ps.typoCorrections);
          }
        }
        matchingProducts.push(prod);
      }

      const directShopHit =
        (filterTarget ? ownCatMatches : true) &&
        (searchTerm ? shopScoreEval.matched : true);

      let crossBestScore = 0;
      const combinedCrossHit =
        filterTarget &&
        searchTerm &&
        ownCatMatches &&
        shopProducts.some((prod) => {
          const ps = scoreProductSearch(
            prod,
            { business_name: plain.businessName, locality_name: plain.locality_name, distance_km: evalResult.distance_km },
            searchTerm,
            categoryMaster,
            dynamicSynonyms
          );
          if (ps.matched) {
            if (ps.score > crossBestScore) crossBestScore = ps.score;
            if (ps.matchedViaTypo) {
              shopMatchedViaTypo = true;
              Object.assign(typoCorrections, ps.typoCorrections);
            }
          }
          return ps.matched;
        });

      if (!directShopHit && !combinedCrossHit && matchingProducts.length === 0) {
        continue;
      }

      if (shopScoreEval.matched && shopScoreEval.matchedViaTypo) {
        shopMatchedViaTypo = true;
        Object.assign(typoCorrections, shopScoreEval.typoCorrections);
      }
      if (shopMatchedViaTypo) anyMatchedViaTypo = true;

      matchingProductCount = matchingProducts.length;
      relevanceScore = Number(
        Math.max(shopScoreEval.matched ? shopScoreEval.score : 0, bestProdScore, crossBestScore).toFixed(2)
      );
    }

    const revStat = reviewStatsMap[Number(plain.id)];
    const folStat = followStatsMap[Number(plain.id)] || { follower_count: 0, is_following: false };
    matchedItems.push(
      formatBusinessProfile(plain, {
        distance_km: evalResult.distance_km,
        distance: evalResult.distance,
        matched_by: evalResult.matched_by,
        society_access_status: evalResult.society_access_status || null,
        product_count: pCap.product_count || 0,
        matching_product_count: matchingProductCount,
        selling_categories: sellingCategories,
        delivery_product_count: pCap.delivery_product_count || 0,
        pickup_product_count: pCap.pickup_product_count || 0,
        supports_home_delivery: supportsDelivery,
        supports_store_pickup: supportsPickup,
        rating: revStat?.rating ?? null,
        review_count: revStat?.review_count ?? 0,
        follower_count: folStat.follower_count,
        is_following: folStat.is_following,
        active_offer_count: offerCountMap[Number(plain.id)] || 0,
        is_deliverable: true,
        relevance_score: searchTerm ? relevanceScore : null,
        matched_via_typo: shopMatchedViaTypo,
      })
    );
  }

  const sortMode = (query.sort || (searchTerm ? 'relevance' : 'distance'))
    .toString()
    .toLowerCase();
  matchedItems.sort((a, b) => {
    if (sortMode === 'relevance' && searchTerm) {
      const relDiff = Number(b.relevance_score || 0) - Number(a.relevance_score || 0);
      if (Math.abs(relDiff) > 0.01) return relDiff;
    }
    if (sortMode === 'featured' && a.is_featured !== b.is_featured) {
      return a.is_featured ? -1 : 1;
    }
    if (sortMode === 'newest') {
      return Number(b.id) - Number(a.id);
    }
    const da = a.distance_km;
    const db = b.distance_km;
    if (da !== null && db !== null) {
      if (da !== db) return da - db;
    } else if (da !== null) return -1;
    else if (db !== null) return 1;

    if (a.is_verified !== b.is_verified) return a.is_verified ? -1 : 1;
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    return Number(b.id) - Number(a.id);
  });

  const didYouMean = searchTerm
    ? computeDidYouMean(searchTerm, Array.from(vocabSet), typoCorrections)
    : null;

  const page = Math.max(1, parseInt(query.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || 50, 10)));
  const total = matchedItems.length;
  const start = (page - 1) * limit;
  const paged = matchedItems.slice(start, start + limit);
  const latencyMs = Date.now() - startedAt;

  const responsePayload = {
    total,
    page,
    limit,
    location_context: {
      latitude: loc.latitude,
      longitude: loc.longitude,
      radius_km: loc.radius_km,
      city_id: loc.city_id,
      city_name: loc.city_name,
      locality_id: loc.locality_id,
      locality_name: loc.locality_name,
      pincode_id: loc.pincode_id,
      pincode: loc.pincode,
      society_id: loc.society_id,
    },
    items: paged,
    businesses: paged,
    search_meta: {
      query: searchTerm || null,
      normalized_query: searchTerm ? normalizeText(searchTerm) : null,
      sort: sortMode,
      did_you_mean: didYouMean,
      corrected_query: didYouMean,
      matched_via_typo: anyMatchedViaTypo,
      latency_ms: latencyMs,
    },
  };

  if (cacheEntryKey && !query._skipCache) {
    setCachedSearchPayload(cacheEntryKey, responsePayload).catch(() => {});
  }

  if (shouldLog) {
    logSearchEvent({
      query: searchTerm,
      categoryId: filterTarget?.category_id || (query.category_id ? Number(query.category_id) : null),
      categoryName: filterTarget?.category_name || query.category || null,
      businessResultCount: total,
      matchedViaTypo: anyMatchedViaTypo,
      didYouMean,
      latencyMs,
      locationContext: loc,
      userId: query._viewerUserId || null,
      source: query.source || 'resident_search',
    }).catch(() => {});
  }

  return responsePayload;
};

export const getAllProfiles = async (query = {}) => {
  const result = await getNearbyBusinesses({
    include_unverified: query.include_unverified ?? 'true',
    ...query,
    limit: query.limit || 100,
  });
  return result.items;
};

export const getProfileById = async (id, query = {}) => {
  const profile = await BusinessProfile.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName'], required: false },
      { model: BusinessCategory, as: 'category', attributes: ['id', 'name', 'icon'], required: false },
      {
        model: BusinessCoverageArea,
        as: 'coverageAreas',
        where: { is_deleted: false, is_active: true },
        required: false,
      },
      {
        model: SocietyBusinessAccess,
        as: 'societyAccesses',
        where: { is_deleted: false },
        required: false,
      },
    ],
  });
  if (!profile) return null;

  const plain = profile.toJSON();
  const societyIds = [
    ...new Set([
      ...(plain.societyAccesses || []).map((a) => Number(a.society_id)).filter(Boolean),
      ...(plain.society_id ? [Number(plain.society_id)] : []),
    ]),
  ];

  const [productCaps, offerCounts, followStatsMap, breakdownRows, stateRec, districtRec, societyRows] = await Promise.all([
    fetchProductCapabilitiesByBusinessIds([profile.id]),
    fetchOfferCountsByBusinessIds([profile.id]),
    fetchFollowStatsByBusinessIds([profile.id], query._viewerUserId || null),
    BusinessReview.findAll({
      attributes: ['rating', [fn('COUNT', col('id')), 'cnt']],
      where: { business_id: profile.id, is_deleted: false },
      group: ['rating'],
      raw: true,
    }),
    plain.state_id ? State.findByPk(plain.state_id, { attributes: ['id', 'name'] }) : null,
    plain.district_id ? District.findByPk(plain.district_id, { attributes: ['id', 'district_name_english'] }) : null,
    societyIds.length > 0
      ? SocietyProfile.findAll({
          where: { id: { [Op.in]: societyIds }, is_deleted: false },
          attributes: ['id', 'society_name', 'address', 'latitude', 'longitude'],
        })
      : [],
  ]);

  const pCap = productCaps[Number(profile.id)] || {};
  const folStat = followStatsMap[Number(profile.id)] || { follower_count: 0, is_following: false };
  const productCount = pCap.product_count || 0;

  const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let totalReviews = 0;
  let weightedSum = 0;
  for (const row of breakdownRows) {
    const star = Number(row.rating);
    const cnt = Number(row.cnt || 0);
    if (star >= 1 && star <= 5) {
      ratingBreakdown[star] = cnt;
      totalReviews += cnt;
      weightedSum += star * cnt;
    }
  }
  const avgRating = totalReviews > 0 ? Number((weightedSum / totalReviews).toFixed(1)) : null;

  const socMap = Object.fromEntries(societyRows.map((s) => [Number(s.id), s.toJSON()]));
  const hydratedSocietyAccesses = (plain.societyAccesses || []).map((acc) => ({
    ...acc,
    society: socMap[Number(acc.society_id)] || null,
    society_name: socMap[Number(acc.society_id)]?.society_name || acc.society_name || null,
  }));

  const loc = businessCoverageService.parseLocationQuery(query);
  const evalResult = businessCoverageService.evaluateBusinessMatch(
    plain,
    plain.coverageAreas || [],
    hydratedSocietyAccesses,
    loc
  );

  return formatBusinessProfile(profile, {
    product_count: productCount,
    delivery_product_count: pCap.delivery_product_count || 0,
    pickup_product_count: pCap.pickup_product_count || 0,
    supports_home_delivery: Boolean(pCap.supports_home_delivery),
    supports_store_pickup: Boolean(pCap.supports_store_pickup),
    follower_count: folStat.follower_count,
    is_following: folStat.is_following,
    active_offer_count: offerCounts[Number(profile.id)] || 0,
    state_name: stateRec?.name || null,
    district_name: districtRec?.district_name_english || null,
    society_name: plain.society_id ? socMap[Number(plain.society_id)]?.society_name || null : null,
    owner_name: plain.user?.userName || null,
    rating: avgRating,
    review_count: totalReviews,
    rating_breakdown: ratingBreakdown,
    society_accesses: hydratedSocietyAccesses,
    distance_km: evalResult.distance_km ?? null,
    distance: evalResult.distance ?? null,
    matched_by: loc.hasLocationFilter ? evalResult.matched_by : null,
    society_access_status: evalResult.society_access_status ?? null,
    is_deliverable: loc.hasLocationFilter ? Boolean(evalResult.matched) : true,
  });
};

export const getProfileByUserId = async (userId) => {
  let profile = await BusinessProfile.findOne({
    where: { userId, is_deleted: false },
    order: [['id', 'DESC']],
  });

  if (!profile) {
    profile = await BusinessProfile.findOne({
      where: { id: 101, is_deleted: false },
    });
  }
  if (!profile) return null;
  return getProfileById(profile.id);
};

export const updateProfile = async (id, updateData) => {
  const profile = await BusinessProfile.findOne({
    where: { id, is_deleted: false },
  });
  if (!profile) return null;

  const mapped = await normalizeProfileInput(updateData, true);
  const explicitAreas = parseCoverageAreasInput(updateData);
  const actorId = mapped.updated_by || profile.userId || null;

  await sequelize.transaction(async (t) => {
    await profile.update(
      {
        ...mapped,
        updatedAt: new Date(),
      },
      { transaction: t }
    );

    if (explicitAreas !== null) {
      const mergedDefaults = {
        ...profile.toJSON(),
        ...mapped,
      };
      await businessCoverageService.upsertBusinessCoverageAreas(id, explicitAreas, {
        profileDefaults: mergedDefaults,
        actorUserId: actorId,
        transaction: t,
      });
    } else if (
      mapped.latitude !== undefined ||
      mapped.longitude !== undefined ||
      mapped.city_id !== undefined ||
      mapped.default_radius_km !== undefined
    ) {
      // If business has NO active coverage areas yet, auto-seed them from updated location
      const existingCount = await BusinessCoverageArea.count({
        where: { business_id: id, is_deleted: false },
        transaction: t,
      });
      if (existingCount === 0) {
        const mergedDefaults = { ...profile.toJSON(), ...mapped };
        const fallbackAreas = buildDefaultCoverageAreas(mergedDefaults);
        if (fallbackAreas.length > 0) {
          await businessCoverageService.upsertBusinessCoverageAreas(id, fallbackAreas, {
            profileDefaults: mergedDefaults,
            actorUserId: actorId,
            transaction: t,
          });
        }
      }
    }
  });

  invalidateSearchQueryCache().catch(() => {});
  return getProfileById(id);
};

export const getBusinessCoverage = async (businessId) => {
  const profile = await BusinessProfile.findOne({
    where: { id: businessId, is_deleted: false },
  });
  if (!profile) return null;

  const cov = await businessCoverageService.getBusinessCoverage(profile);
  return {
    ...cov,
    coverage_scope: profile.coverage_scope || 'PUBLIC',
    default_radius_km: Number(profile.default_radius_km || 10),
    location: {
      state_id: profile.state_id,
      district_id: profile.district_id,
      city_id: profile.city_id,
      city_name: profile.city_name,
      locality_id: profile.locality_id,
      locality_name: profile.locality_name,
      pincode_id: profile.pincode_id,
      pincode: profile.pincode,
      society_id: profile.society_id,
      address: profile.address,
      latitude: profile.latitude !== null ? Number(profile.latitude) : null,
      longitude: profile.longitude !== null ? Number(profile.longitude) : null,
    },
  };
};

export const updateBusinessCoverage = async (businessId, payload = {}, actorUserId = null) => {
  const profile = await BusinessProfile.findOne({
    where: { id: businessId, is_deleted: false },
  });
  if (!profile) return null;

  const locUpdates = await normalizeProfileInput(payload, true);
  const explicitAreas = parseCoverageAreasInput(payload);

  await sequelize.transaction(async (t) => {
    if (Object.keys(locUpdates).length > 0) {
      await profile.update(
        {
          ...locUpdates,
          updated_by: actorUserId,
          updatedAt: new Date(),
        },
        { transaction: t }
      );
    }

    const mergedDefaults = {
      ...profile.toJSON(),
      ...locUpdates,
    };

    if (explicitAreas !== null) {
      await businessCoverageService.upsertBusinessCoverageAreas(businessId, explicitAreas, {
        profileDefaults: mergedDefaults,
        actorUserId,
        transaction: t,
      });
    } else if (
      locUpdates.latitude !== undefined ||
      locUpdates.longitude !== undefined ||
      locUpdates.city_id !== undefined ||
      locUpdates.default_radius_km !== undefined
    ) {
      const existingCount = await BusinessCoverageArea.count({
        where: { business_id: businessId, is_deleted: false },
        transaction: t,
      });
      if (existingCount === 0) {
        const autoAreas = buildDefaultCoverageAreas(mergedDefaults);
        if (autoAreas.length > 0) {
          await businessCoverageService.upsertBusinessCoverageAreas(businessId, autoAreas, {
            profileDefaults: mergedDefaults,
            actorUserId,
            transaction: t,
          });
        }
      }
    }
  });

  invalidateSearchQueryCache().catch(() => {});
  return getBusinessCoverage(businessId);
};

export const requestSocietyAccess = async (businessId, payload, actorUserId) => {
  const profile = await BusinessProfile.findOne({ where: { id: businessId, is_deleted: false } });
  if (!profile) return null;
  return businessCoverageService.requestSocietyAccess(businessId, payload, actorUserId);
};

export const listBusinessSocietyAccess = async (businessId) => {
  const cov = await getBusinessCoverage(businessId);
  return cov ? cov.society_accesses : null;
};

export const listSocietyBusinessRequests = async (societyId, status) =>
  businessCoverageService.listSocietyBusinessRequests(societyId, status);

export const reviewSocietyAccess = async (accessId, action, reviewerId, body) =>
  businessCoverageService.reviewSocietyAccess(accessId, action, reviewerId, body);

export const softDeleteProfile = async (id, deletedRemarks, updated_by) => {
  const profile = await BusinessProfile.findOne({
    where: { id, is_deleted: false },
  });
  if (!profile) return null;
  await profile.update({
    is_deleted: true,
    is_active: false,
    deletedRemarks,
    updated_by,
    updatedAt: new Date(),
  });
  invalidateSearchQueryCache().catch(() => {});
  return profile;
};

export const approveProfile = async (id, updated_by) => {
  const profile = await BusinessProfile.findOne({
    where: { id, is_deleted: false },
  });
  if (!profile) return null;
  await profile.update({
    is_verified: true,
    updated_by,
    updatedAt: new Date(),
  });
  invalidateSearchQueryCache().catch(() => {});
  return getProfileById(id);
};

export const rejectProfile = async (id, rejectRemarks, updated_by) => {
  const profile = await BusinessProfile.findOne({
    where: { id, is_deleted: false },
  });
  if (!profile) return null;
  await profile.update({
    is_verified: false,
    remark: rejectRemarks,
    updated_by,
    updatedAt: new Date(),
  });
  invalidateSearchQueryCache().catch(() => {});
  return getProfileById(id);
};

export const featureProfile = async (id, updated_by) => {
  const profile = await BusinessProfile.findOne({
    where: { id, is_deleted: false },
  });
  if (!profile) return null;
  await profile.update({
    is_featured: true,
    updated_by,
    updatedAt: new Date(),
  });
  invalidateSearchQueryCache().catch(() => {});
  return getProfileById(id);
};

export const unfeatureProfile = async (id, updated_by) => {
  const profile = await BusinessProfile.findOne({
    where: { id, is_deleted: false },
  });
  if (!profile) return null;
  await profile.update({
    is_featured: false,
    updated_by,
    updatedAt: new Date(),
  });
  invalidateSearchQueryCache().catch(() => {});
  return getProfileById(id);
};
