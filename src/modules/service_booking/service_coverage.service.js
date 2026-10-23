import {
  ServiceAreaType,
  ServiceRadiusOption,
} from '../service_config/service_config.models.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import ServiceCoverageArea from '../service_listing/service_coverage_area.model.js';
import { City, Locality, Pincode } from '../location_master/location_master.models.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import SocietyServiceAccess, { SOCIETY_SERVICE_ACCESS_STATUS } from '../society_service_access/society_service_access.model.js';
import sequelize from '../../config/db.js';

/**
 * Calculates Great-Circle Distance between two geographic points using the Haversine Formula.
 * Returns distance in Kilometers (KM) rounded to 2 decimal places.
 */
export const calculateHaversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const p1 = Number(lat1);
  const l1 = Number(lon1);
  const p2 = Number(lat2);
  const l2 = Number(lon2);

  if (isNaN(p1) || isNaN(l1) || isNaN(p2) || isNaN(l2)) {
    return null;
  }

  const R = 6371; // Earth's mean radius in KM
  const dLat = ((p2 - p1) * Math.PI) / 180;
  const dLon = ((l2 - l1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1 * Math.PI) / 180) *
      Math.cos((p2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100;
};

/**
 * Resolves all active coverage areas for a given service listing.
 * Includes relations: City, Locality, Pincode, SocietyProfile, ServiceRadiusOption.
 */
export const resolveCoverageAreas = async (listingId) => {
  return await ServiceCoverageArea.findAll({
    where: { service_id: listingId, is_active: true, is_deleted: false },
    include: [
      { model: ServiceRadiusOption, as: 'radius_option' },
      { model: City, as: 'city' },
      { model: Locality, as: 'locality' },
      { model: Pincode, as: 'pincode' },
      { model: SocietyProfile, as: 'society' },
    ],
    order: [['display_order', 'ASC'], ['id', 'ASC']],
  });
};

/**
 * Resolves authoritative Provider Service Coverage Configuration (Legacy fallback).
 */
export const resolveProviderCoverageConfig = async (listing, providerProfile) => {
  let areaType = listing?.service_area_type;
  if (!areaType && listing?.service_area_type_id) {
    areaType = await ServiceAreaType.findOne({
      where: { id: listing.service_area_type_id, is_deleted: false },
    });
  }

  let radiusOption = listing?.radius_option;
  if (!radiusOption && listing?.radius_option_id) {
    radiusOption = await ServiceRadiusOption.findOne({
      where: { id: listing.radius_option_id, is_deleted: false },
    });
  }

  let profileArea = providerProfile?.service_area;
  if (typeof profileArea === 'string') {
    try {
      profileArea = JSON.parse(profileArea);
    } catch (_) {
      profileArea = null;
    }
  }

  const providerCity = profileArea?.city || 'Patna';
  const providerLocalities = Array.isArray(profileArea?.localities) ? profileArea.localities : [];
  const providerPincodes = Array.isArray(profileArea?.pincodes) ? profileArea.pincodes : [];

  let effectiveRadiusKm = 15;
  if (radiusOption && radiusOption.radius_km) {
    effectiveRadiusKm = Number(radiusOption.radius_km);
  } else if (profileArea?.radiusKm) {
    effectiveRadiusKm = Number(profileArea.radiusKm);
  }

  const centerLat = profileArea?.centerLatitude != null ? Number(profileArea.centerLatitude) : 25.5941;
  const centerLon = profileArea?.centerLongitude != null ? Number(profileArea.centerLongitude) : 85.1376;

  return {
    areaTypeCode: areaType?.code || 'RADIUS',
    areaTypeName: areaType?.name || 'Within Radial Distance',
    radiusKm: effectiveRadiusKm,
    city: providerCity,
    localities: providerLocalities,
    pincodes: providerPincodes,
    centerLatitude: centerLat,
    centerLongitude: centerLon,
  };
};

/**
 * AUTHORITATIVE ENTERPRISE COVERAGE ENGINE (Step 4 & Society Access Hardening)
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates whether customer location (Coordinates / Locality / Pincode / City / Society)
 * falls strictly within the active coverage perimeters of the Service Listing AND
 * satisfies Society Service Access approval rules when applicable.
 *
 * Rules:
 * PUBLIC: Geographical Match + Service Active = Eligible
 * SOCIETY: Geographical Match + Society Identified + Society-Service Access === APPROVED = Eligible
 * SOCIETY_AND_PUBLIC:
 *   - Public customer: Geographical Match + Service Active = Eligible
 *   - Society customer: Geographical Match + Society-Service Access === APPROVED = Eligible
 *
 * "Inside radius" alone NEVER grants permission to serve an unapproved society.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const validateCustomerCoverageEligibility = async ({
  listing,
  providerProfile,
  customerLocation = {},
  userRole = 'resident',
}) => {
  const listingId = listing?.id;

  let {
    latitude: custLat,
    longitude: custLon,
    locality: custLocality,
    pincode: custPincode,
    city: custCity,
    society_id: custSocietyId,
    service_address: custAddress,
    locality_id: custLocalityId,
    pincode_id: custPincodeId,
    city_id: custCityId,
  } = customerLocation;

  // 1. If society_id is provided, resolve society profile coordinates if customer coords missing
  if (custSocietyId) {
    const soc = await SocietyProfile.findOne({
      where: { id: custSocietyId, is_deleted: false },
    });
    if (soc) {
      if ((custLat == null || custLon == null) && soc.latitude && soc.longitude) {
        custLat = Number(soc.latitude);
        custLon = Number(soc.longitude);
      }
    }
  }

  // 2. Society Service Access Verification (Phases 7, 8, 11)
  let societyAccessRecord = null;
  if (custSocietyId) {
    societyAccessRecord = await SocietyServiceAccess.findOne({
      where: {
        service_id: listingId,
        society_id: custSocietyId,
        is_deleted: false,
      },
    });

    // Check approval status: Society bookings STRICTLY require status === APPROVED
    if (!societyAccessRecord || societyAccessRecord.status !== SOCIETY_SERVICE_ACCESS_STATUS.APPROVED) {
      const statusLabel = societyAccessRecord ? societyAccessRecord.status : 'NOT_REQUESTED';
      return {
        isEligible: false,
        eligible: false,
        reasonCode: 'SOCIETY_ACCESS_NOT_APPROVED',
        accessStatus: statusLabel,
        societyAccessId: societyAccessRecord?.id || null,
        reason: societyAccessRecord
          ? `Provider service access to this residential society is currently ${societyAccessRecord.status}.`
          : 'Provider has not been approved by this residential society administration.',
        distanceKm: null,
      };
    }
  } else if (listing?.coverage_scope === 'SOCIETY') {
    // If listing is SOCIETY-only, but customer has no society specified/belongs to no society
    return {
      isEligible: false,
      eligible: false,
      reasonCode: 'SOCIETY_ONLY_SERVICE',
      reason: 'This service is exclusively available to approved residential societies.',
      distanceKm: null,
    };
  }

  // 3. Fetch multi-coverage areas for this listing
  let coverageAreas = [];
  if (listingId) {
    coverageAreas = await resolveCoverageAreas(listingId);
  }

  // 4. MULTI-COVERAGE EVALUATION
  if (coverageAreas && coverageAreas.length > 0) {
    let matchedArea = null;
    let matchedDistanceKm = null;
    let matchedAllowedRadiusKm = null;
    let failureReason = 'OUT_OF_SERVICE_AREA';

    for (const area of coverageAreas) {
      if (!area.is_active || area.is_deleted) continue;

      // Scope Check: PUBLIC vs SOCIETY vs SOCIETY_AND_PUBLIC
      const scope = area.coverage_scope || 'PUBLIC';
      if (scope === 'SOCIETY') {
        if (userRole === 'guest') {
          continue; // Guest cannot access private society-only service
        }
        if (!custSocietyId) {
          continue; // Requires a society booking
        }
        if (area.society_id && Number(area.society_id) !== Number(custSocietyId)) {
          continue; // Different society
        }
      }

      const method = (area.coverage_method || 'RADIUS').toUpperCase();

      // METHOD A: RADIUS
      if (method === 'RADIUS') {
        const originLat = area.origin_latitude != null ? Number(area.origin_latitude) : null;
        const originLon = area.origin_longitude != null ? Number(area.origin_longitude) : null;

        let allowedRadius = area.resolved_radius_km != null ? Number(area.resolved_radius_km) : null;
        if (!allowedRadius && area.radius_option?.radius_km) {
          allowedRadius = Number(area.radius_option.radius_km);
        }
        if (!allowedRadius && area.radius_option_id) {
          const ro = await ServiceRadiusOption.findOne({
            where: { id: area.radius_option_id, is_active: true, is_deleted: false },
          });
          if (ro) allowedRadius = Number(ro.radius_km);
        }

        if (originLat != null && originLon != null && allowedRadius != null) {
          if (custLat != null && custLon != null) {
            const dist = calculateHaversineDistanceKm(custLat, custLon, originLat, originLon);
            if (dist != null && dist <= allowedRadius) {
              matchedArea = area;
              matchedDistanceKm = dist;
              matchedAllowedRadiusKm = allowedRadius;
              break; // MATCH FOUND!
            }
          }
        }
      }

      // METHOD B: LOCALITY
      else if (method === 'LOCALITY') {
        let isLocalityMatch = false;
        if (custLocalityId && area.locality_id && Number(custLocalityId) === Number(area.locality_id)) {
          isLocalityMatch = true;
        } else if (area.locality?.name || custLocality || area.origin_address || custAddress) {
          const cleanArea = (area.locality?.name || area.origin_address || '').replace(/,\s*patna/i, '').replace(/patna/i, '').trim().toLowerCase();
          const cleanLoc = (custLocality || '').replace(/,\s*patna/i, '').replace(/patna/i, '').trim().toLowerCase();
          const cleanAddr = (custAddress || '').toLowerCase();
          const rawArea = (area.locality?.name || area.origin_address || '').trim().toLowerCase();

          if (cleanArea && (
            (cleanLoc && (cleanLoc === cleanArea || cleanLoc.includes(cleanArea) || cleanArea.includes(cleanLoc))) ||
            (cleanAddr && cleanAddr.includes(cleanArea)) ||
            (cleanLoc && rawArea.includes(cleanLoc))
          )) {
            isLocalityMatch = true;
          }
        }

        if (isLocalityMatch) {
          matchedArea = area;
          break; // MATCH FOUND!
        }
      }

      // METHOD C: PINCODE
      else if (method === 'PINCODE') {
        let isPincodeMatch = false;
        if (custPincodeId && area.pincode_id && Number(custPincodeId) === Number(area.pincode_id)) {
          isPincodeMatch = true;
        } else {
          const areaPin = String(area.pincode?.pincode || '').trim();
          const targetPin = String(custPincode || '').trim();
          const areaAddr = (area.origin_address || '').trim();
          const areaName = (area.area_name || '').trim();
          const custAddr = (custAddress || '').trim();

          if (targetPin && (
            (areaPin && areaPin === targetPin) ||
            areaAddr.includes(targetPin) ||
            areaName.includes(targetPin)
          )) {
            isPincodeMatch = true;
          } else if (areaPin && custAddr.includes(areaPin)) {
            isPincodeMatch = true;
          }
        }

        if (isPincodeMatch) {
          matchedArea = area;
          break; // MATCH FOUND!
        }
      }

      // METHOD D: CITY
      else if (method === 'CITY') {
        let isCityMatch = false;
        if (custCityId && area.city_id && Number(custCityId) === Number(area.city_id)) {
          isCityMatch = true;
        } else {
          const areaCity = (area.city?.name || area.origin_address || area.area_name || 'Patna').trim().toLowerCase();
          const targetCity = (custCity || 'Patna').trim().toLowerCase();
          if (areaCity.includes(targetCity) || targetCity.includes(areaCity) || (areaCity.includes('patna') && targetCity.includes('patna'))) {
            isCityMatch = true;
          }
        }

        if (isCityMatch) {
          matchedArea = area;
          break; // MATCH FOUND!
        }
      }

      // METHOD E: SOCIETY
      else if (method === 'SOCIETY') {
        if (custSocietyId && area.society_id && Number(custSocietyId) === Number(area.society_id)) {
          matchedArea = area;
          break; // MATCH FOUND!
        }
      }
    }

    if (matchedArea) {
      return {
        isEligible: true,
        eligible: true,
        reason: 'Location is eligible within active coverage area perimeter.',
        matchedCoverageAreaId: matchedArea.id,
        coverageMethod: matchedArea.coverage_method,
        coverageScope: matchedArea.coverage_scope,
        distanceKm: matchedDistanceKm,
        allowedRadiusKm: matchedAllowedRadiusKm,
        societyAccessId: societyAccessRecord ? societyAccessRecord.id : null,
        societyAccessStatus: societyAccessRecord ? societyAccessRecord.status : null,
        societyId: custSocietyId || null,
        matchedArea: {
          id: matchedArea.id,
          coverage_scope: matchedArea.coverage_scope,
          coverage_method: matchedArea.coverage_method,
          origin_address: matchedArea.origin_address,
          resolved_radius_km: matchedAllowedRadiusKm,
        },
      };
    }

    return {
      isEligible: false,
      eligible: false,
      reasonCode: failureReason,
      reason: 'This service is not available at your designated location.',
      distanceKm: null,
    };
  }

  // 5. LEGACY SINGLE-AREA FALLBACK (When no child coverage areas are stored)
  const legacyConfig = await resolveProviderCoverageConfig(listing, providerProfile);

  // City check
  if (custCity && legacyConfig.city) {
    if (custCity.trim().toLowerCase() !== legacyConfig.city.trim().toLowerCase()) {
      return {
        isEligible: false,
        eligible: false,
        reasonCode: 'OUT_OF_SERVICE_AREA',
        reason: `Service is only available in ${legacyConfig.city}. Your booking location is in ${custCity}.`,
        distanceKm: null,
      };
    }
  }

  // Distance check
  if (
    custLat != null &&
    custLon != null &&
    legacyConfig.centerLatitude != null &&
    legacyConfig.centerLongitude != null
  ) {
    const dist = calculateHaversineDistanceKm(
      custLat,
      custLon,
      legacyConfig.centerLatitude,
      legacyConfig.centerLongitude
    );

    if (dist != null) {
      if (dist > legacyConfig.radiusKm) {
        return {
          isEligible: false,
          eligible: false,
          reasonCode: 'OUT_OF_SERVICE_AREA',
          reason: `Service location is ${dist} KM away, exceeding maximum service radius of ${legacyConfig.radiusKm} KM.`,
          distanceKm: dist,
          maxAllowedRadiusKm: legacyConfig.radiusKm,
        };
      }

      return {
        isEligible: true,
        eligible: true,
        reason: 'Location within radial coverage perimeter.',
        distanceKm: dist,
        allowedRadiusKm: legacyConfig.radiusKm,
        coverageMethod: 'RADIUS',
        coverageScope: listing?.coverage_scope || 'PUBLIC',
        societyAccessId: societyAccessRecord ? societyAccessRecord.id : null,
        societyAccessStatus: societyAccessRecord ? societyAccessRecord.status : null,
        societyId: custSocietyId || null,
      };
    }
  }

  // Default eligible for legacy listings within city
  return {
    isEligible: true,
    eligible: true,
    reason: 'Customer location falls within provider service boundary.',
    distanceKm: null,
    coverageMethod: legacyConfig.areaTypeCode,
    coverageScope: listing?.coverage_scope || 'PUBLIC',
    societyAccessId: societyAccessRecord ? societyAccessRecord.id : null,
    societyAccessStatus: societyAccessRecord ? societyAccessRecord.status : null,
    societyId: custSocietyId || null,
  };
};

export default {
  calculateHaversineDistanceKm,
  resolveCoverageAreas,
  resolveProviderCoverageConfig,
  validateCustomerCoverageEligibility,
};
