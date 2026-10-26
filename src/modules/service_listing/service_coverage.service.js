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
import { listingMasterIncludes } from './service_listing.service.js';

/**
 * Calculates Great-Circle Distance between two geographic points using Haversine formula.
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

  const R = 6371; // Earth mean radius in KM
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
 * Resolves all active coverage areas for a given service listing from DB.
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
 * Resolves authoritative Provider Service Coverage Configuration (Fallback).
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

  let effectiveRadiusKm = 10;
  if (radiusOption && radiusOption.radius_km) {
    effectiveRadiusKm = Number(radiusOption.radius_km);
  } else if (profileArea?.radiusKm) {
    effectiveRadiusKm = Number(profileArea.radiusKm);
  }

  const centerLat = profileArea?.centerLatitude != null ? Number(profileArea.centerLatitude) : (profileArea?.latitude != null ? Number(profileArea.latitude) : 25.5941);
  const centerLon = profileArea?.centerLongitude != null ? Number(profileArea.centerLongitude) : (profileArea?.longitude != null ? Number(profileArea.longitude) : 85.1376);

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
 * Evaluates live coverage eligibility against MySQL database.
 */
export const evaluateLiveCoverage = async ({ listingId, customerLocation = {} }) => {
  const listing = await ServiceListing.findOne({
    where: { id: listingId, is_deleted: false },
    include: [
      {
        model: ServiceProviderProfile,
        as: 'provider',
      },
      ...listingMasterIncludes,
    ],
  });

  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }

  const provider = listing.provider || {};

  // 1. Live Provider Availability Checks
  let isProviderAvailable = true;
  let providerAvailabilityLabel = 'Active';

  if (!listing.is_available) {
    isProviderAvailable = false;
    providerAvailabilityLabel = 'Listing Paused';
  } else if (provider.vacation_mode === true) {
    isProviderAvailable = false;
    providerAvailabilityLabel = 'On Vacation (Unavailable)';
  } else if (provider.is_online === false) {
    isProviderAvailable = false;
    providerAvailabilityLabel = 'Offline';
  } else if (provider.is_verified === false && provider.verification_status === 'suspended') {
    isProviderAvailable = false;
    providerAvailabilityLabel = 'Account Suspended';
  }

  let {
    latitude: custLat,
    longitude: custLon,
    locality: custLocality,
    pincode: custPincode,
    city: custCity,
    society_id: custSocietyId,
    service_address: custAddress,
    location_type: locationType = 'public',
  } = customerLocation;

  custLat = custLat != null ? Number(custLat) : null;
  custLon = custLon != null ? Number(custLon) : null;

  // 2. Society Exclusive Guard
  const scope = (listing.coverage_scope || 'PUBLIC').toUpperCase();
  if (scope === 'SOCIETY' && (locationType !== 'society' || !custSocietyId)) {
    return {
      is_eligible: false,
      is_provider_available: isProviderAvailable,
      provider_availability: providerAvailabilityLabel,
      distance_km: null,
      allowed_radius_km: 10,
      coverage_zone: 'Exclusive Society Service',
      matched_method: 'SOCIETY',
      reason: 'This service is exclusively available to approved residential societies.',
    };
  }

  // 3. Society Service Access Verification (if society booking)
  if (custSocietyId) {
    const societyAccessRecord = await SocietyServiceAccess.findOne({
      where: {
        service_id: listingId,
        society_id: custSocietyId,
        is_deleted: false,
      },
    });

    if (societyAccessRecord && societyAccessRecord.status !== SOCIETY_SERVICE_ACCESS_STATUS.APPROVED) {
      return {
        is_eligible: false,
        is_provider_available: isProviderAvailable,
        provider_availability: providerAvailabilityLabel,
        distance_km: null,
        allowed_radius_km: 10,
        coverage_zone: 'Society Access Restricted',
        matched_method: 'SOCIETY',
        reason: `Provider service access to this residential society is currently ${societyAccessRecord.status}.`,
      };
    }
  }

  // 4. Resolve multi-coverage areas
  const coverageAreas = await resolveCoverageAreas(listingId);

  if (coverageAreas && coverageAreas.length > 0) {
    let minDistance = null;
    let maxAllowed = 10;
    let matchedArea = null;

    // Check Society Method
    if (locationType === 'society' && custSocietyId) {
      const socArea = coverageAreas.find(
        (a) => (a.coverage_method || '').toUpperCase() === 'SOCIETY' && Number(a.society_id) === Number(custSocietyId)
      );
      if (socArea) {
        return {
          is_eligible: isProviderAvailable,
          is_provider_available: isProviderAvailable,
          provider_availability: providerAvailabilityLabel,
          distance_km: null,
          allowed_radius_km: null,
          coverage_zone: `${socArea.society?.societyName || 'Residential Society'} (Approved)`,
          matched_method: 'SOCIETY',
          reason: isProviderAvailable
            ? 'Approved service access for your residential society.'
            : `Service provider is currently ${providerAvailabilityLabel}.`,
        };
      }
    }

    // Check Locality Method
    if (custLocality && custLocality.trim().length > 0) {
      const targetLoc = custLocality.trim().toLowerCase();
      const locArea = coverageAreas.find((a) => {
        if ((a.coverage_method || '').toUpperCase() !== 'LOCALITY') return false;
        const aLoc = (a.locality?.name || a.origin_address || '').trim().toLowerCase();
        return aLoc.length > 0 && (aLoc.includes(targetLoc) || targetLoc.includes(aLoc));
      });
      if (locArea) {
        return {
          is_eligible: isProviderAvailable,
          is_provider_available: isProviderAvailable,
          provider_availability: providerAvailabilityLabel,
          distance_km: null,
          allowed_radius_km: null,
          coverage_zone: `${custLocality} (Public Area)`,
          matched_method: 'LOCALITY',
          reason: isProviderAvailable
            ? `Service is directly available in your locality (${custLocality}).`
            : `Service provider is currently ${providerAvailabilityLabel}.`,
        };
      }
    }

    // Check Pincode Method
    if (custPincode && custPincode.trim().length > 0) {
      const targetPin = custPincode.trim();
      const pinArea = coverageAreas.find((a) => {
        if ((a.coverage_method || '').toUpperCase() !== 'PINCODE') return false;
        const aPin = String(a.pincode?.pincode || a.origin_address || '').trim();
        return aPin.length > 0 && aPin.includes(targetPin);
      });
      if (pinArea) {
        return {
          is_eligible: isProviderAvailable,
          is_provider_available: isProviderAvailable,
          provider_availability: providerAvailabilityLabel,
          distance_km: null,
          allowed_radius_km: null,
          coverage_zone: `PIN ${targetPin} (Public Area)`,
          matched_method: 'PINCODE',
          reason: isProviderAvailable
            ? `Service is directly available in your postal pincode (${targetPin}).`
            : `Service provider is currently ${providerAvailabilityLabel}.`,
        };
      }
    }

    // Check Radial Distance Method
    for (const a of coverageAreas) {
      const radius = a.resolved_radius_km != null ? Number(a.resolved_radius_km) : (a.radius_option?.radius_km ? Number(a.radius_option.radius_km) : 10);
      if (radius > maxAllowed) maxAllowed = radius;

      const oLat = a.origin_latitude != null ? Number(a.origin_latitude) : null;
      const oLon = a.origin_longitude != null ? Number(a.origin_longitude) : null;

      if (oLat != null && oLon != null && custLat != null && custLon != null) {
        const dist = calculateHaversineDistanceKm(custLat, custLon, oLat, oLon);
        if (dist != null && (minDistance == null || dist < minDistance)) {
          minDistance = dist;
          matchedArea = a;
        }
      }
    }

    if (minDistance != null) {
      const isWithin = minDistance <= maxAllowed;
      const eligible = isWithin && isProviderAvailable;
      const zoneName = custLocality ? `${custLocality} (Public Area)` : (matchedArea?.origin_address || 'Service Zone');
      return {
        is_eligible: eligible,
        is_provider_available: isProviderAvailable,
        provider_availability: providerAvailabilityLabel,
        distance_km: minDistance,
        allowed_radius_km: maxAllowed,
        coverage_zone: zoneName,
        matched_method: 'RADIUS',
        reason: !isWithin
          ? `Service location is ${minDistance} km away, exceeding maximum service radius of ${maxAllowed} km.`
          : (!isProviderAvailable
              ? `Service provider is currently ${providerAvailabilityLabel}.`
              : `Your location is ${minDistance} km away (within ${maxAllowed} km radius).`),
      };
    }
  }

  // 5. Fallback to Provider Base Profile Area
  const legacyConfig = await resolveProviderCoverageConfig(listing, provider);
  let distanceKm = null;

  if (custLat != null && custLon != null && legacyConfig.centerLatitude != null && legacyConfig.centerLongitude != null) {
    distanceKm = calculateHaversineDistanceKm(custLat, custLon, legacyConfig.centerLatitude, legacyConfig.centerLongitude);
  }

  const allowedRadius = legacyConfig.radiusKm || 10;
  const isWithinRadius = distanceKm == null || distanceKm <= allowedRadius;
  const eligible = isWithinRadius && isProviderAvailable;
  const zoneName = custLocality ? `${custLocality} (Public Area)` : `${legacyConfig.city || 'Patna'} Perimeter`;

  return {
    is_eligible: eligible,
    is_provider_available: isProviderAvailable,
    provider_availability: providerAvailabilityLabel,
    distance_km: distanceKm != null ? distanceKm : null,
    allowed_radius_km: allowedRadius,
    coverage_zone: zoneName,
    matched_method: 'RADIUS',
    reason: !isWithinRadius
      ? `Service location is ${distanceKm} km away, exceeding provider standard radius of ${allowedRadius} km.`
      : (!isProviderAvailable
          ? `Service provider is currently ${providerAvailabilityLabel}.`
          : (distanceKm != null
              ? `Your location is ${distanceKm} km away (within ${allowedRadius} km radius).`
              : 'Your location falls within provider standard service area.')),
  };
};

export default {
  calculateHaversineDistanceKm,
  resolveCoverageAreas,
  resolveProviderCoverageConfig,
  evaluateLiveCoverage,
};
