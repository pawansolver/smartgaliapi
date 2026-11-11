import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import BusinessCoverageArea, {
  BUSINESS_COVERAGE_METHODS,
  BUSINESS_COVERAGE_SCOPES,
} from './business_coverage_area.model.js';
import SocietyBusinessAccess, {
  SOCIETY_BUSINESS_ACCESS_STATUS,
} from './society_business_access.model.js';
import {
  Country,
  State,
  District,
  City,
  Locality,
  Pincode,
  LocalityPincode,
} from '../location_master/location_master.models.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import { calculateHaversineDistanceKm } from '../service_booking/service_coverage.service.js';

const toNullableInt = (val) => {
  if (val === undefined || val === null || val === '') return null;
  const parsed = Number(val);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toNullableFloat = (val) => {
  if (val === undefined || val === null || val === '') return null;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDistanceLabel = (km) => {
  if (km === null || km === undefined || !Number.isFinite(km)) return null;
  if (km < 1.0) {
    return `${Math.max(50, Math.round(km * 1000))} m`;
  }
  return `${km.toFixed(1)} km`;
};

const norm = (val) => (val || '').toString().trim().toLowerCase();

export const parseLocationQuery = (query = {}) => {
  const latitude = toNullableFloat(query.latitude ?? query.lat);
  const longitude = toNullableFloat(query.longitude ?? query.lng ?? query.lon);
  const radiusKm = toNullableFloat(query.radius_km ?? query.radiusKm);
  const country_id = toNullableInt(query.country_id);
  const state_id = toNullableInt(query.state_id);
  const district_id = toNullableInt(query.district_id);
  const city_id = toNullableInt(query.city_id);
  const locality_id = toNullableInt(query.locality_id);
  const pincode_id = toNullableInt(query.pincode_id);
  const society_id = toNullableInt(query.society_id);

  const city_name = (query.city_name ?? query.city ?? '').toString().trim() || null;
  const locality_name = (query.locality_name ?? query.locality ?? '').toString().trim() || null;
  const pincode = (query.pincode ?? '').toString().trim() || null;
  const society_name = (query.society_name ?? '').toString().trim() || null;

  const hasLocationFilter = Boolean(
    (latitude !== null && longitude !== null) ||
      city_id ||
      city_name ||
      locality_id ||
      locality_name ||
      pincode_id ||
      pincode ||
      society_id ||
      district_id ||
      state_id
  );

  return {
    latitude,
    longitude,
    radius_km: radiusKm,
    country_id,
    state_id,
    district_id,
    city_id,
    city_name,
    locality_id,
    locality_name,
    pincode_id,
    pincode,
    society_id,
    society_name,
    hasLocationFilter,
  };
};

/**
 * Resolve & hydrate Location Master IDs, names, and fallback GPS coordinates.
 */
export const resolveLocationNames = async (input = {}) => {
  const resolved = {
    state_id: toNullableInt(input.state_id),
    district_id: toNullableInt(input.district_id),
    city_id: toNullableInt(input.city_id),
    city_name: (input.city_name ?? input.city ?? '').toString().trim() || null,
    locality_id: toNullableInt(input.locality_id),
    locality_name: (input.locality_name ?? input.locality ?? '').toString().trim() || null,
    pincode_id: toNullableInt(input.pincode_id),
    pincode: (input.pincode ?? '').toString().trim() || null,
    society_id: toNullableInt(input.society_id),
    latitude: toNullableFloat(input.latitude),
    longitude: toNullableFloat(input.longitude),
  };

  if (resolved.society_id) {
    const soc = await SocietyProfile.findByPk(resolved.society_id);
    if (soc) {
      if (resolved.latitude === null && soc.latitude != null) {
        resolved.latitude = Number(soc.latitude);
      }
      if (resolved.longitude === null && soc.longitude != null) {
        resolved.longitude = Number(soc.longitude);
      }
    }
  }

  if (resolved.pincode_id) {
    const pin = await Pincode.findByPk(resolved.pincode_id);
    if (pin) {
      resolved.pincode = resolved.pincode || pin.pincode;
      resolved.city_id = resolved.city_id || pin.city_id || null;
      resolved.locality_id = resolved.locality_id || pin.locality_id || null;
      resolved.district_id = resolved.district_id || pin.district_id || null;
      resolved.state_id = resolved.state_id || pin.state_id || null;
    }
  } else if (resolved.pincode) {
    const pin = await Pincode.findOne({ where: { pincode: resolved.pincode, is_deleted: false } });
    if (pin) {
      resolved.pincode_id = pin.id;
      resolved.city_id = resolved.city_id || pin.city_id || null;
      resolved.locality_id = resolved.locality_id || pin.locality_id || null;
      resolved.district_id = resolved.district_id || pin.district_id || null;
      resolved.state_id = resolved.state_id || pin.state_id || null;
    }
  }

  if (resolved.locality_id) {
    const loc = await Locality.findByPk(resolved.locality_id);
    if (loc) {
      resolved.locality_name = loc.name || resolved.locality_name;
      resolved.city_id = resolved.city_id || loc.city_id || null;
      if (resolved.latitude === null && loc.latitude != null) resolved.latitude = Number(loc.latitude);
      if (resolved.longitude === null && loc.longitude != null) resolved.longitude = Number(loc.longitude);
    }
  } else if (resolved.locality_name) {
    const whereLoc = { normalized_name: norm(resolved.locality_name).replace(/\s+/g, '_'), is_deleted: false };
    let loc = await Locality.findOne({ where: whereLoc });
    if (!loc) {
      loc = await Locality.findOne({ where: { name: { [Op.like]: resolved.locality_name }, is_deleted: false } });
    }
    if (loc) {
      resolved.locality_id = loc.id;
      resolved.locality_name = loc.name;
      resolved.city_id = resolved.city_id || loc.city_id || null;
      if (resolved.latitude === null && loc.latitude != null) resolved.latitude = Number(loc.latitude);
      if (resolved.longitude === null && loc.longitude != null) resolved.longitude = Number(loc.longitude);
    }
  }

  if (resolved.city_id) {
    const city = await City.findByPk(resolved.city_id);
    if (city) {
      resolved.city_name = city.name || resolved.city_name;
      resolved.state_id = resolved.state_id || city.state_id || null;
      resolved.district_id = resolved.district_id || city.district_id || null;
      if (resolved.latitude === null && city.latitude != null) resolved.latitude = Number(city.latitude);
      if (resolved.longitude === null && city.longitude != null) resolved.longitude = Number(city.longitude);
    }
  } else if (resolved.city_name) {
    const city = await City.findOne({
      where: {
        [Op.or]: [
          { normalized_name: norm(resolved.city_name).replace(/\s+/g, '_') },
          { name: { [Op.like]: resolved.city_name } },
        ],
        is_deleted: false,
      },
    });
    if (city) {
      resolved.city_id = city.id;
      resolved.city_name = city.name;
      resolved.state_id = resolved.state_id || city.state_id || null;
      resolved.district_id = resolved.district_id || city.district_id || null;
      if (resolved.latitude === null && city.latitude != null) resolved.latitude = Number(city.latitude);
      if (resolved.longitude === null && city.longitude != null) resolved.longitude = Number(city.longitude);
    }
  }

  return resolved;
};

/**
 * Hydrate location names & validate coverage areas before saving.
 */
export const normalizeCoverageAreas = async (rawAreas = [], profileDefaults = {}) => {
  if (!Array.isArray(rawAreas) || rawAreas.length === 0) return [];

  const validScopes = Object.values(BUSINESS_COVERAGE_SCOPES);
  const validMethods = Object.values(BUSINESS_COVERAGE_METHODS);
  const normalizedList = [];

  for (let i = 0; i < rawAreas.length; i++) {
    const area = rawAreas[i] || {};
    const method = (area.coverage_method || 'RADIUS').toString().toUpperCase();
    const scope = (area.coverage_scope || profileDefaults.coverage_scope || 'PUBLIC')
      .toString()
      .toUpperCase();

    if (!validMethods.includes(method)) {
      throw new Error(`Invalid coverage_method: ${method}`);
    }
    if (!validScopes.includes(scope)) {
      throw new Error(`Invalid coverage_scope: ${scope}`);
    }

    const locInfo = await resolveLocationNames({
      state_id: area.state_id ?? profileDefaults.state_id,
      district_id: area.district_id ?? profileDefaults.district_id,
      city_id: area.city_id ?? (method === 'CITY' || method === 'RADIUS' ? profileDefaults.city_id : null),
      city_name: area.city_name ?? area.city ?? null,
      locality_id: area.locality_id ?? (method === 'LOCALITY' ? profileDefaults.locality_id : null),
      locality_name: area.locality_name ?? area.locality ?? null,
      pincode_id: area.pincode_id ?? (method === 'PINCODE' ? profileDefaults.pincode_id : null),
      pincode: area.pincode ?? null,
      society_id: area.society_id ?? null,
      latitude: area.origin_latitude ?? area.latitude ?? (method === 'RADIUS' ? profileDefaults.latitude : null),
      longitude: area.origin_longitude ?? area.longitude ?? (method === 'RADIUS' ? profileDefaults.longitude : null),
    });

    let societyName = area.society_name || null;
    if (locInfo.society_id && !societyName) {
      const soc = await SocietyProfile.findByPk(locInfo.society_id);
      if (!soc) throw new Error(`Invalid society_id: ${locInfo.society_id}`);
      societyName = soc.society_name;
    }

    if (method === 'CITY' && !locInfo.city_id && !locInfo.city_name) {
      throw new Error('CITY coverage area requires city_id or city_name.');
    }
    if (method === 'LOCALITY' && !locInfo.locality_id && !locInfo.locality_name) {
      throw new Error('LOCALITY coverage area requires locality_id or locality_name.');
    }
    if (method === 'PINCODE' && !locInfo.pincode_id && !locInfo.pincode) {
      throw new Error('PINCODE coverage area requires pincode_id or pincode.');
    }
    if (method === 'SOCIETY' && !locInfo.society_id) {
      throw new Error('SOCIETY coverage area requires society_id.');
    }
    if (method === 'RADIUS' && (locInfo.latitude === null || locInfo.longitude === null)) {
      throw new Error('RADIUS coverage area requires origin latitude and longitude.');
    }

    normalizedList.push({
      coverage_scope: scope,
      coverage_method: method,
      country_id: toNullableInt(area.country_id),
      state_id: locInfo.state_id,
      district_id: locInfo.district_id,
      city_id: locInfo.city_id,
      city_name: locInfo.city_name,
      locality_id: locInfo.locality_id,
      locality_name: locInfo.locality_name,
      pincode_id: locInfo.pincode_id,
      pincode: locInfo.pincode,
      society_id: locInfo.society_id,
      society_name: societyName,
      origin_latitude: locInfo.latitude,
      origin_longitude: locInfo.longitude,
      origin_address: (area.origin_address || profileDefaults.address || '').toString().trim() || null,
      resolved_radius_km:
        toNullableFloat(area.resolved_radius_km ?? area.radius_km) ??
        toNullableFloat(profileDefaults.default_radius_km) ??
        10.0,
      display_order: area.display_order !== undefined ? Number(area.display_order) : i,
      is_active: area.is_active !== undefined ? Boolean(area.is_active) : true,
      is_deleted: false,
    });
  }

  return normalizedList;
};

/**
 * Transactionally replace coverage areas and auto-create Society Access requests when needed.
 */
export const upsertBusinessCoverageAreas = async (
  businessId,
  coverageAreas = [],
  { profileDefaults = {}, actorUserId = null, transaction = null } = {}
) => {
  const execInTx = async (t) => {
    const normalized = await normalizeCoverageAreas(coverageAreas, profileDefaults);

    await BusinessCoverageArea.update(
      { is_deleted: true, is_active: false, updated_by: actorUserId, updatedAt: new Date() },
      { where: { business_id: businessId, is_deleted: false }, transaction: t }
    );

    let created = [];
    if (normalized.length > 0) {
      const payload = normalized.map((item) => ({
        ...item,
        business_id: businessId,
        created_by: actorUserId,
        updated_by: actorUserId,
        created_at: new Date(),
        updatedAt: new Date(),
      }));
      created = await BusinessCoverageArea.bulkCreate(payload, { transaction: t });
    }

    // Ensure SocietyBusinessAccess requests exist for SOCIETY-targeted areas
    const targetSocietyIds = [
      ...new Set(
        normalized
          .filter((a) => a.society_id && (a.coverage_method === 'SOCIETY' || a.coverage_scope !== 'PUBLIC'))
          .map((a) => Number(a.society_id))
      ),
    ];

    for (const sId of targetSocietyIds) {
      const existing = await SocietyBusinessAccess.findOne({
        where: { business_id: businessId, society_id: sId },
        transaction: t,
      });
      if (!existing) {
        await SocietyBusinessAccess.create(
          {
            business_id: businessId,
            society_id: sId,
            requested_by: actorUserId,
            requested_at: new Date(),
            status: SOCIETY_BUSINESS_ACCESS_STATUS.REQUESTED,
            notes: 'Auto-created from business coverage configuration',
            is_active: true,
            is_deleted: false,
            created_by: actorUserId,
            created_at: new Date(),
            updatedAt: new Date(),
          },
          { transaction: t }
        );
      } else if (existing.is_deleted) {
        await existing.update(
          {
            is_deleted: false,
            is_active: true,
            status: SOCIETY_BUSINESS_ACCESS_STATUS.REQUESTED,
            requested_at: new Date(),
            updated_by: actorUserId,
            updatedAt: new Date(),
          },
          { transaction: t }
        );
      }
    }

    return created;
  };

  if (transaction) return execInTx(transaction);
  return sequelize.transaction(execInTx);
};

export const getBusinessCoverage = async (business) => {
  const businessId = typeof business === 'object' ? business.id : Number(business);
  const areas = await BusinessCoverageArea.findAll({
    where: { business_id: businessId, is_deleted: false, is_active: true },
    order: [['display_order', 'ASC'], ['id', 'ASC']],
  });
  const accesses = await SocietyBusinessAccess.findAll({
    where: { business_id: businessId, is_deleted: false },
    order: [['id', 'DESC']],
  });

  // Hydrate society names on access rows
  const societyIds = [...new Set(accesses.map((a) => a.society_id).filter(Boolean))];
  let socMap = {};
  if (societyIds.length > 0) {
    const socs = await SocietyProfile.findAll({
      where: { id: { [Op.in]: societyIds } },
      attributes: ['id', 'society_name', 'address', 'latitude', 'longitude'],
    });
    socMap = Object.fromEntries(socs.map((s) => [Number(s.id), s.toJSON()]));
  }

  return {
    business_id: businessId,
    coverage_areas: areas.map((a) => (a.toJSON ? a.toJSON() : a)),
    society_accesses: accesses.map((acc) => {
      const json = acc.toJSON ? acc.toJSON() : { ...acc };
      json.society = socMap[Number(json.society_id)] || null;
      return json;
    }),
  };
};

export const requestSocietyAccess = async (businessId, { society_id, notes }, actorUserId) => {
  const sId = toNullableInt(society_id);
  if (!sId) throw new Error('Valid society_id is required.');

  const soc = await SocietyProfile.findOne({ where: { id: sId, is_deleted: false } });
  if (!soc) throw new Error('Target society not found.');

  let access = await SocietyBusinessAccess.findOne({
    where: { business_id: businessId, society_id: sId },
  });

  if (access && !access.is_deleted) {
    if (access.status === SOCIETY_BUSINESS_ACCESS_STATUS.APPROVED) {
      return access;
    }
    await access.update({
      status: SOCIETY_BUSINESS_ACCESS_STATUS.REQUESTED,
      requested_by: actorUserId,
      requested_at: new Date(),
      notes: notes || access.notes,
      rejection_reason: null,
      updated_by: actorUserId,
      updatedAt: new Date(),
    });
  } else if (access && access.is_deleted) {
    await access.update({
      is_deleted: false,
      is_active: true,
      status: SOCIETY_BUSINESS_ACCESS_STATUS.REQUESTED,
      requested_by: actorUserId,
      requested_at: new Date(),
      notes: notes || null,
      rejection_reason: null,
      updated_by: actorUserId,
      updatedAt: new Date(),
    });
  } else {
    access = await SocietyBusinessAccess.create({
      business_id: businessId,
      society_id: sId,
      requested_by: actorUserId,
      requested_at: new Date(),
      status: SOCIETY_BUSINESS_ACCESS_STATUS.REQUESTED,
      notes: notes || null,
      is_active: true,
      is_deleted: false,
      created_by: actorUserId,
      created_at: new Date(),
      updatedAt: new Date(),
    });
  }

  // Also ensure a SOCIETY coverage area exists for this shop & society
  const existingArea = await BusinessCoverageArea.findOne({
    where: {
      business_id: businessId,
      society_id: sId,
      coverage_method: 'SOCIETY',
      is_deleted: false,
    },
  });
  if (!existingArea) {
    await BusinessCoverageArea.create({
      business_id: businessId,
      coverage_scope: 'SOCIETY_AND_PUBLIC',
      coverage_method: 'SOCIETY',
      society_id: sId,
      society_name: soc.society_name,
      origin_latitude: soc.latitude,
      origin_longitude: soc.longitude,
      origin_address: soc.address,
      resolved_radius_km: 5.0,
      is_active: true,
      is_deleted: false,
      display_order: 99,
      created_by: actorUserId,
      created_at: new Date(),
      updatedAt: new Date(),
    });
  }

  return access;
};

export const listSocietyBusinessRequests = async (societyId, statusFilter = null) => {
  const where = { society_id: societyId, is_deleted: false };
  if (statusFilter) where.status = statusFilter.toString().toUpperCase();
  return SocietyBusinessAccess.findAll({
    where,
    order: [['requested_at', 'DESC']],
  });
};

export const reviewSocietyAccess = async (
  accessId,
  action,
  reviewerId,
  { notes = null, rejection_reason = null } = {}
) => {
  const access = await SocietyBusinessAccess.findOne({
    where: { id: accessId, is_deleted: false },
  });
  if (!access) throw new Error('Society business access record not found.');

  const statusMap = {
    approve: SOCIETY_BUSINESS_ACCESS_STATUS.APPROVED,
    reject: SOCIETY_BUSINESS_ACCESS_STATUS.REJECTED,
    suspend: SOCIETY_BUSINESS_ACCESS_STATUS.SUSPENDED,
    revoke: SOCIETY_BUSINESS_ACCESS_STATUS.REVOKED,
  };
  const nextStatus = statusMap[action];
  if (!nextStatus) throw new Error(`Unsupported review action: ${action}`);
  if (action === 'reject' && !rejection_reason) {
    throw new Error('rejection_reason is required when rejecting society access.');
  }

  await access.update({
    status: nextStatus,
    reviewed_by: reviewerId,
    reviewed_at: new Date(),
    notes: notes ?? access.notes,
    rejection_reason: action === 'reject' ? rejection_reason : access.rejection_reason,
    updated_by: reviewerId,
    updatedAt: new Date(),
  });

  return access;
};

/**
 * Core hybrid coverage & distance matcher (PUBLIC Radius/Locality/Pincode/City + SOCIETY).
 */
export const evaluateBusinessMatch = (businessPlain, areas = [], accesses = [], queryLoc = {}) => {
  const shopLat = toNullableFloat(businessPlain.latitude);
  const shopLng = toNullableFloat(businessPlain.longitude);
  const custLat = queryLoc.latitude;
  const custLng = queryLoc.longitude;

  let baseDistanceKm = null;
  if (custLat !== null && custLng !== null && shopLat !== null && shopLng !== null) {
    baseDistanceKm = calculateHaversineDistanceKm(custLat, custLng, shopLat, shopLng);
  }

  // If no location filters exist in request, return shop with computed distance (if any)
  if (!queryLoc.hasLocationFilter) {
    return {
      matched: true,
      distance_km: baseDistanceKm,
      distance: formatDistanceLabel(baseDistanceKm),
      matched_by: 'ALL',
      matched_area: areas[0] || null,
    };
  }

  const activeAreas = (areas || []).filter((a) => a.is_active !== false && !a.is_deleted);
  const accessBySociety = new Map();
  for (const acc of accesses || []) {
    if (!acc.is_deleted) accessBySociety.set(Number(acc.society_id), acc);
  }

  // Explicit distance filter when user specifies both GPS and radius_km (e.g. "Within 2 km")
  const strictUserRadius =
    custLat !== null && custLng !== null && queryLoc.radius_km !== null && queryLoc.radius_km > 0;

  let bestDistance = baseDistanceKm;
  let matchedBy = null;
  let matchedArea = null;

  // 1. Society Resident Mode (when society_id is selected)
  if (queryLoc.society_id) {
    const sId = Number(queryLoc.society_id);
    const acc = accessBySociety.get(sId);

    // Explicitly blocked for this society -> reject immediately
    if (
      acc &&
      [
        SOCIETY_BUSINESS_ACCESS_STATUS.REJECTED,
        SOCIETY_BUSINESS_ACCESS_STATUS.SUSPENDED,
        SOCIETY_BUSINESS_ACCESS_STATUS.REVOKED,
      ].includes(acc.status)
    ) {
      return { matched: false, distance_km: baseDistanceKm, distance: formatDistanceLabel(baseDistanceKm), matched_by: null };
    }

    // Direct Society area targeting
    const societyArea = activeAreas.find(
      (a) => a.coverage_method === 'SOCIETY' && Number(a.society_id) === sId
    );
    if (societyArea) {
      const isApproved = acc && acc.status === SOCIETY_BUSINESS_ACCESS_STATUS.APPROVED;
      if (isApproved || (acc == null && Number(businessPlain.society_id) === sId)) {
        return {
          matched: true,
          distance_km: baseDistanceKm ?? 0.0,
          distance: formatDistanceLabel(baseDistanceKm ?? 0.0),
          matched_by: 'SOCIETY',
          matched_area: societyArea,
          society_access_status: acc?.status || 'APPROVED',
        };
      }
    }

    // If business is strictly SOCIETY-only, don't fall through to PUBLIC areas unless this society approved it
    if ((businessPlain.coverage_scope || 'PUBLIC') === 'SOCIETY') {
      if (
        Number(businessPlain.society_id) === sId &&
        (!acc || acc.status === SOCIETY_BUSINESS_ACCESS_STATUS.APPROVED)
      ) {
        return {
          matched: true,
          distance_km: baseDistanceKm ?? 0.0,
          distance: formatDistanceLabel(baseDistanceKm ?? 0.0),
          matched_by: 'SOCIETY',
          matched_area: null,
          society_access_status: acc?.status || 'APPROVED',
        };
      }
      return { matched: false, distance_km: baseDistanceKm, distance: formatDistanceLabel(baseDistanceKm), matched_by: null };
    }
  } else {
    // Public user without society_id should NOT see SOCIETY-only exclusive businesses
    if ((businessPlain.coverage_scope || 'PUBLIC') === 'SOCIETY') {
      return { matched: false, distance_km: baseDistanceKm, distance: formatDistanceLabel(baseDistanceKm), matched_by: null };
    }
  }

  // Synthesize virtual fallback areas from base BusinessProfile columns if no explicit coverage areas exist
  const candidateAreas =
    activeAreas.length > 0
      ? activeAreas.filter((a) => a.coverage_scope !== 'SOCIETY')
      : [
          {
            coverage_scope: businessPlain.coverage_scope || 'PUBLIC',
            coverage_method:
              shopLat !== null && shopLng !== null
                ? 'RADIUS'
                : businessPlain.locality_id || businessPlain.locality_name
                    ? 'LOCALITY'
                    : 'CITY',
            city_id: businessPlain.city_id,
            city_name: businessPlain.city_name,
            locality_id: businessPlain.locality_id,
            locality_name: businessPlain.locality_name,
            pincode_id: businessPlain.pincode_id,
            pincode: businessPlain.pincode,
            origin_latitude: shopLat,
            origin_longitude: shopLng,
            resolved_radius_km: Number(businessPlain.default_radius_km || 10),
          },
        ];

  for (const area of candidateAreas) {
    const areaLat = toNullableFloat(area.origin_latitude) ?? shopLat;
    const areaLng = toNullableFloat(area.origin_longitude) ?? shopLng;

    let areaDistKm = baseDistanceKm;
    if (custLat !== null && custLng !== null && areaLat !== null && areaLng !== null) {
      areaDistKm = calculateHaversineDistanceKm(custLat, custLng, areaLat, areaLng);
      if (bestDistance === null || areaDistKm < bestDistance) {
        bestDistance = areaDistKm;
      }
    }

    // When customer picked an explicit distance cap ("Within X km"), strictly enforce distance first
    if (strictUserRadius) {
      if (areaDistKm !== null && areaDistKm <= queryLoc.radius_km) {
        const shopCap = area.coverage_method === 'RADIUS' ? Number(area.resolved_radius_km || 15) : queryLoc.radius_km;
        if (area.coverage_method !== 'RADIUS' || areaDistKm <= shopCap) {
          matchedBy = area.coverage_method;
          matchedArea = area;
          bestDistance = areaDistKm;
          break;
        }
      }
      continue;
    }

    if (area.coverage_method === 'RADIUS' && areaDistKm !== null) {
      const radiusLimit = Number(area.resolved_radius_km || businessPlain.default_radius_km || 10);
      if (areaDistKm <= radiusLimit) {
        matchedBy = 'RADIUS';
        matchedArea = area;
        bestDistance = areaDistKm;
        break;
      }
    }

    if (
      area.coverage_method === 'PINCODE' &&
      ((queryLoc.pincode_id && Number(area.pincode_id) === queryLoc.pincode_id) ||
        (queryLoc.pincode && norm(area.pincode) === norm(queryLoc.pincode)))
    ) {
      matchedBy = 'PINCODE';
      matchedArea = area;
      break;
    }

    if (
      area.coverage_method === 'LOCALITY' &&
      ((queryLoc.locality_id && Number(area.locality_id) === queryLoc.locality_id) ||
        (queryLoc.locality_name && norm(area.locality_name) === norm(queryLoc.locality_name)))
    ) {
      matchedBy = 'LOCALITY';
      matchedArea = area;
      break;
    }

    if (
      area.coverage_method === 'CITY' &&
      ((queryLoc.city_id && Number(area.city_id) === queryLoc.city_id) ||
        (queryLoc.city_name && norm(area.city_name) === norm(queryLoc.city_name)))
    ) {
      matchedBy = 'CITY';
      matchedArea = area;
      break;
    }
  }

  // Fallback check against base BusinessProfile fields when shop has explicit areas of one method
  // (e.g. shop saved RADIUS only, but customer searched by Locality/Pincode in same neighborhood without GPS)
  if (!matchedBy && !strictUserRadius) {
    if (
      (queryLoc.pincode_id && Number(businessPlain.pincode_id) === queryLoc.pincode_id) ||
      (queryLoc.pincode && norm(businessPlain.pincode) === norm(queryLoc.pincode))
    ) {
      matchedBy = 'PROFILE_PINCODE';
    } else if (
      (queryLoc.locality_id && Number(businessPlain.locality_id) === queryLoc.locality_id) ||
      (queryLoc.locality_name && norm(businessPlain.locality_name) === norm(queryLoc.locality_name))
    ) {
      matchedBy = 'PROFILE_LOCALITY';
    } else if (
      custLat === null &&
      ((queryLoc.city_id && Number(businessPlain.city_id) === queryLoc.city_id) ||
        (queryLoc.city_name && norm(businessPlain.city_name) === norm(queryLoc.city_name)))
    ) {
      matchedBy = 'PROFILE_CITY';
    }
  }

  return {
    matched: Boolean(matchedBy),
    distance_km: bestDistance !== null ? Number(bestDistance.toFixed(2)) : null,
    distance: formatDistanceLabel(bestDistance),
    matched_by: matchedBy,
    matched_area: matchedArea,
  };
};

/**
 * Evaluate product-level delivery_coverage override on top of shop coverage.
 */
export const checkProductDeliveryEligibility = (productPlain, shopEval, queryLoc) => {
  if (!queryLoc || !queryLoc.hasLocationFilter) {
    return {
      is_deliverable: true,
      delivery_message: null,
      distance_km: shopEval?.distance_km ?? null,
      distance: shopEval?.distance ?? null,
    };
  }

  if (shopEval && !shopEval.matched) {
    return {
      is_deliverable: false,
      delivery_message: 'Outside shop service area for selected location',
      distance_km: shopEval.distance_km ?? null,
      distance: shopEval.distance ?? null,
    };
  }

  const cov = productPlain.delivery_coverage;
  if (!cov || typeof cov !== 'object') {
    return {
      is_deliverable: true,
      delivery_message: shopEval?.distance ? `Delivers to your area (${shopEval.distance})` : 'Available in your area',
      distance_km: shopEval?.distance_km ?? null,
      distance: shopEval?.distance ?? null,
    };
  }

  if (cov.state_id && queryLoc.state_id && Number(cov.state_id) !== Number(queryLoc.state_id)) {
    return {
      is_deliverable: false,
      delivery_message: 'Product not deliverable in selected state',
      distance_km: shopEval?.distance_km ?? null,
      distance: shopEval?.distance ?? null,
    };
  }

  if (cov.district_id && queryLoc.district_id && Number(cov.district_id) !== Number(queryLoc.district_id)) {
    return {
      is_deliverable: false,
      delivery_message: 'Product not deliverable in selected district',
      distance_km: shopEval?.distance_km ?? null,
      distance: shopEval?.distance ?? null,
    };
  }

  const localityIds = Array.isArray(cov.locality_ids)
    ? cov.locality_ids.map(Number)
    : Array.isArray(cov.localities)
      ? cov.localities.map((l) => Number(typeof l === 'object' ? l.id : l)).filter(Boolean)
      : [];

  if (localityIds.length > 0 && queryLoc.locality_id && !localityIds.includes(Number(queryLoc.locality_id))) {
    return {
      is_deliverable: false,
      delivery_message: 'Product restricted to specific localities',
      distance_km: shopEval?.distance_km ?? null,
      distance: shopEval?.distance ?? null,
    };
  }

  const pincodes = Array.isArray(cov.pincodes)
    ? cov.pincodes.map((p) => (typeof p === 'object' ? p.pincode : p)?.toString().trim()).filter(Boolean)
    : [];

  if (pincodes.length > 0 && queryLoc.pincode && !pincodes.includes(queryLoc.pincode)) {
    return {
      is_deliverable: false,
      delivery_message: `Not deliverable to pincode ${queryLoc.pincode}`,
      distance_km: shopEval?.distance_km ?? null,
      distance: shopEval?.distance ?? null,
    };
  }

  return {
    is_deliverable: true,
    delivery_message: shopEval?.distance ? `Delivers to your area (${shopEval.distance})` : 'Available in your area',
    distance_km: shopEval?.distance_km ?? null,
    distance: shopEval?.distance ?? null,
  };
};

/**
 * Resolve arbitrary dropped map pin coordinates (lat, lng) into nearest Location Master
 * locality/city/pincode context and nearby societies.
 */
export const resolveCoordinatesContext = async (rawLat, rawLng) => {
  const latitude = toNullableFloat(rawLat);
  const longitude = toNullableFloat(rawLng);
  if (latitude === null || longitude === null) {
    throw new Error('Valid latitude and longitude coordinates are required.');
  }

  const [localities, cities, societies] = await Promise.all([
    Locality.findAll({
      where: { is_deleted: false, is_active: true },
      attributes: ['id', 'city_id', 'name', 'latitude', 'longitude'],
    }),
    City.findAll({
      where: { is_deleted: false, is_active: true },
      attributes: ['id', 'state_id', 'district_id', 'name', 'latitude', 'longitude'],
    }),
    SocietyProfile.findAll({
      where: { is_deleted: false },
      attributes: ['id', 'society_name', 'address', 'latitude', 'longitude'],
    }),
  ]);

  let nearestLocality = null;
  let minLocDist = Infinity;
  for (const loc of localities) {
    const lLat = toNullableFloat(loc.latitude);
    const lLng = toNullableFloat(loc.longitude);
    if (lLat === null || lLng === null) continue;
    const dist = calculateHaversineDistanceKm(latitude, longitude, lLat, lLng);
    if (dist < minLocDist) {
      minLocDist = dist;
      nearestLocality = loc;
    }
  }

  let matchedCity = null;
  let cityDistKm = null;
  if (nearestLocality && minLocDist <= 15.0 && nearestLocality.city_id) {
    matchedCity = cities.find((c) => Number(c.id) === Number(nearestLocality.city_id)) || null;
  }
  if (!matchedCity) {
    let minCityDist = Infinity;
    for (const c of cities) {
      const cLat = toNullableFloat(c.latitude);
      const cLng = toNullableFloat(c.longitude);
      if (cLat === null || cLng === null) continue;
      const dist = calculateHaversineDistanceKm(latitude, longitude, cLat, cLng);
      if (dist < minCityDist) {
        minCityDist = dist;
        matchedCity = c;
      }
    }
    if (Number.isFinite(minCityDist) && minCityDist <= 45.0) {
      cityDistKm = Number(minCityDist.toFixed(2));
    } else {
      matchedCity = null;
    }
  }

  const localityWithinRange = nearestLocality && minLocDist <= 15.0 ? nearestLocality : null;
  let pincodeRecord = null;
  if (localityWithinRange) {
    const lp = await LocalityPincode.findOne({
      where: { locality_id: localityWithinRange.id },
      order: [['is_primary', 'DESC'], ['id', 'ASC']],
    });
    if (lp?.pincode_id) {
      pincodeRecord = await Pincode.findOne({
        where: { id: lp.pincode_id, is_deleted: false, is_active: true },
      });
    }
    if (!pincodeRecord) {
      pincodeRecord = await Pincode.findOne({
        where: { locality_id: localityWithinRange.id, is_deleted: false, is_active: true },
        order: [['display_order', 'ASC'], ['id', 'ASC']],
      });
    }
  }
  if (!pincodeRecord && matchedCity) {
    pincodeRecord = await Pincode.findOne({
      where: { city_id: matchedCity.id, is_deleted: false, is_active: true },
      order: [['display_order', 'ASC'], ['id', 'ASC']],
    });
  }

  let stateName = null;
  const resolvedStateId = pincodeRecord?.state_id || matchedCity?.state_id || null;
  if (resolvedStateId) {
    const state = await State.findByPk(resolvedStateId, { attributes: ['id', 'name'] });
    stateName = state?.name || null;
  }

  const nearbySocieties = [];
  for (const soc of societies) {
    const sLat = toNullableFloat(soc.latitude);
    const sLng = toNullableFloat(soc.longitude);
    if (sLat === null || sLng === null) continue;
    const dist = calculateHaversineDistanceKm(latitude, longitude, sLat, sLng);
    if (dist <= 5.0) {
      nearbySocieties.push({
        id: Number(soc.id),
        society_name: soc.society_name,
        address: soc.address || null,
        latitude: sLat,
        longitude: sLng,
        distance_km: Number(dist.toFixed(2)),
        distance: formatDistanceLabel(dist),
      });
    }
  }
  nearbySocieties.sort((a, b) => a.distance_km - b.distance_km);

  const locName = localityWithinRange?.name || null;
  const cityName = matchedCity?.name || null;
  const parts = [locName, cityName].filter(Boolean);
  if (pincodeRecord?.pincode) parts.push(pincodeRecord.pincode);

  return {
    latitude,
    longitude,
    state_id: resolvedStateId,
    state_name: stateName,
    district_id: pincodeRecord?.district_id || matchedCity?.district_id || null,
    city_id: matchedCity?.id ? Number(matchedCity.id) : null,
    city_name: cityName,
    locality_id: localityWithinRange?.id ? Number(localityWithinRange.id) : null,
    locality_name: locName,
    pincode_id: pincodeRecord?.id ? Number(pincodeRecord.id) : null,
    pincode: pincodeRecord?.pincode || null,
    distance_km: localityWithinRange ? Number(minLocDist.toFixed(2)) : cityDistKm,
    display_label:
      parts.length > 0
        ? parts.join(', ')
        : `Pinned (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
    nearby_societies: nearbySocieties.slice(0, 5),
  };
};

export default {
  parseLocationQuery,
  resolveLocationNames,
  resolveCoordinatesContext,
  normalizeCoverageAreas,
  upsertBusinessCoverageAreas,
  getBusinessCoverage,
  requestSocietyAccess,
  listSocietyBusinessRequests,
  reviewSocietyAccess,
  evaluateBusinessMatch,
  checkProductDeliveryEligibility,
};

