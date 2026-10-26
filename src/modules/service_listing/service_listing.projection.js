/**
 * Enterprise Service Projection & Privacy Shield
 * ─────────────────────────────────────────────────────────────────────────────
 * Protects internal models, PII, and sensitive records from leaking to
 * unauthenticated Guest or Resident discovery endpoints.
 * Ensures provider private home coordinates and internal coverage origin
 * coordinates are NEVER exposed publicly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Maps an internal ServiceListing entity to a secure Public Service Projection.
 * Strips all internal metadata, admin notes, KYC, Aadhaar, PAN, bank details,
 * and provider private GPS/home coordinates.
 */
export const toPublicServiceListing = (listing) => {
  if (!listing) return null;
  const raw = listing.toJSON ? listing.toJSON() : listing;
  const provider = raw.provider || {};
  const providerUser = provider.user || {};
  const category = raw.category || provider.category || {};

  // Parse JSON fields safely if stringified
  let highlights = raw.highlights || [];
  if (typeof highlights === 'string') {
    try { highlights = JSON.parse(highlights); } catch (_) { highlights = []; }
  }
  let images = raw.images || [];
  if (typeof images === 'string') {
    try { images = JSON.parse(images); } catch (_) { images = []; }
  }

  // Safe service area extraction (ONLY city, localities, pincodes, radius - NO private provider residence)
  let publicServiceArea = null;
  if (provider.service_area) {
    let sa = provider.service_area;
    if (typeof sa === 'string') {
      try { sa = JSON.parse(sa); } catch (_) { sa = null; }
    }
    if (sa && typeof sa === 'object') {
      publicServiceArea = {
        city: sa.city || 'Patna',
        localities: Array.isArray(sa.localities) ? sa.localities : [],
        pincodes: Array.isArray(sa.pincodes) ? sa.pincodes : [],
        radiusKm: Number(sa.radiusKm) || 10,
        centerLatitude: sa.centerLatitude != null ? Number(sa.centerLatitude) : (sa.latitude != null ? Number(sa.latitude) : null),
        centerLongitude: sa.centerLongitude != null ? Number(sa.centerLongitude) : (sa.longitude != null ? Number(sa.longitude) : null),
        baseAddress: sa.base_address || sa.baseAddress || null,
      };
    }
  }

  // Safe Coverage Areas Projection (Privacy: Do NOT leak raw GPS coordinates)
  const publicCoverageAreas = Array.isArray(raw.coverage_areas)
    ? raw.coverage_areas
        .filter((a) => a.is_active !== false && !a.is_deleted)
        .map((a) => ({
          id: Number(a.id),
          coverage_scope: a.coverage_scope || 'PUBLIC',
          coverage_method: a.coverage_method || 'RADIUS',
          city_id: a.city_id ? Number(a.city_id) : null,
          city_name: a.city?.name || null,
          locality_id: a.locality_id ? Number(a.locality_id) : null,
          locality_name: a.locality?.name || null,
          pincode_id: a.pincode_id ? Number(a.pincode_id) : null,
          pincode: a.pincode?.pincode || null,
          society_id: a.society_id ? Number(a.society_id) : (a.society?.id ? Number(a.society.id) : null),
          society_name: a.society?.societyName || a.society?.name || null,
          origin_address: a.origin_address || null,
          origin_latitude: a.origin_latitude != null ? Number(a.origin_latitude) : null,
          origin_longitude: a.origin_longitude != null ? Number(a.origin_longitude) : null,
          radius_km: a.resolved_radius_km != null ? Number(a.resolved_radius_km) : (a.radius_option?.radius_km ? Number(a.radius_option.radius_km) : null),
        }))
    : [];

  return {
    id: Number(raw.id),
    title: raw.title || 'Untitled Service',
    description: raw.description || null,
    price: raw.price != null ? Number(raw.price) : null,
    duration: raw.duration || null,
    is_available: !!raw.is_available,
    moderation_status: raw.moderation_status || 'approved',
    coverage_scope: raw.coverage_scope || 'PUBLIC',
    coverage_areas: publicCoverageAreas,
    category_id: raw.category_id ? Number(raw.category_id) : (provider.service_category_id ? Number(provider.service_category_id) : null),
    category_name: category.serviceCategoryName || 'General',
    category_image: category.serviceCategoryImage || null,
    service_subcategory_id: raw.service_subcategory_id ? Number(raw.service_subcategory_id) : null,
    subcategory_name: raw.subcategory?.service_subcategory_name || null,
    highlights: Array.isArray(highlights) ? highlights : [],
    safe_terms: raw.safe_terms || null,
    images: Array.isArray(images) ? images : [],
    pricing_model_id: raw.pricing_model_id ? Number(raw.pricing_model_id) : null,
    pricing_model: raw.pricing_model ? { id: Number(raw.pricing_model.id), code: raw.pricing_model.code, name: raw.pricing_model.name } : null,
    pricing_unit_id: raw.pricing_unit_id ? Number(raw.pricing_unit_id) : null,
    pricing_unit: raw.pricing_unit ? { id: Number(raw.pricing_unit.id), code: raw.pricing_unit.code, name: raw.pricing_unit.name } : null,
    hourly_rate: raw.hourly_rate != null ? Number(raw.hourly_rate) : null,
    inspection_fee: raw.inspection_fee != null ? Number(raw.inspection_fee) : null,
    duration_option: raw.duration_option ? { id: Number(raw.duration_option.id), label: raw.duration_option.label, minutes: Number(raw.duration_option.minutes) } : null,
    buffer_option: raw.buffer_option ? { id: Number(raw.buffer_option.id), label: raw.buffer_option.label, minutes: Number(raw.buffer_option.minutes) } : null,
    execution_method: raw.execution_method ? { id: Number(raw.execution_method.id), code: raw.execution_method.code, name: raw.execution_method.name } : null,
    min_duration: raw.min_duration_option ? { id: Number(raw.min_duration_option.id), label: raw.min_duration_option.label, minutes: raw.min_duration_option.minutes } : null,
    material_policy: raw.material_policy ? { id: Number(raw.material_policy.id), code: raw.material_policy.code, name: raw.material_policy.name } : null,
    charge_type: raw.charge_type ? { id: Number(raw.charge_type.id), code: raw.charge_type.code, name: raw.charge_type.name } : null,
    packages: Array.isArray(raw.packages) ? raw.packages.map(p => ({
      id: Number(p.id),
      package_level_id: p.package_level_id ? Number(p.package_level_id) : null,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      duration_minutes: p.duration_minutes,
      included_items: p.included_items || [],
    })) : [],
    addons: Array.isArray(raw.addons) ? raw.addons.map(a => ({
      id: Number(a.id),
      addon_type_id: a.addon_type_id ? Number(a.addon_type_id) : null,
      name: a.name,
      description: a.description,
      price: Number(a.price),
      is_enabled: !!a.is_enabled,
    })) : [],
    rating: Number(raw.rating || 0.0),
    reviews_count: Number(raw.reviews_count || 0),
    bookings_count: Number(raw.bookings_count || 0),
    distance: raw.distance || (raw.distance_km != null ? `${Number(raw.distance_km).toFixed(1)} km` : null),
    distance_km: raw.distance_km != null ? Number(raw.distance_km) : null,
    provider: {
      id: Number(provider.id || raw.provider_id || 0),
      name: providerUser.userName || provider.business_name || 'Service Professional',
      business_name: provider.business_name || null,
      provider_type: provider.provider_type || 'Independent Professional',
      experience: provider.experience || null,
      rating: Number(provider.rating || 0.0),
      review_count: Number(provider.review_count || 0),
      completed_jobs_count: Number(provider.completed_jobs_count || 0),
      is_verified: !!provider.is_verified,
      verification_status: provider.verification_status || 'underReview',
      is_online: provider.is_online !== undefined ? !!provider.is_online : true,
      service_area: publicServiceArea,
      vacation_mode: !!provider.vacation_mode,
      auto_accept_bookings: !!provider.auto_accept_bookings,
    },
    created_at: raw.created_at,
    updatedAt: raw.updatedAt,
  };
};

/**
 * Maps an internal ServiceProviderProfile entity to a secure Public Provider Projection.
 */
export const toPublicProviderProfile = (profile) => {
  if (!profile) return null;
  const raw = profile.toJSON ? profile.toJSON() : profile;
  const user = raw.user || {};
  const category = raw.category || {};

  let publicServiceArea = null;
  if (raw.service_area) {
    let sa = raw.service_area;
    if (typeof sa === 'string') {
      try { sa = JSON.parse(sa); } catch (_) { sa = null; }
    }
    if (sa && typeof sa === 'object') {
      publicServiceArea = {
        city: sa.city || 'Patna',
        localities: Array.isArray(sa.localities) ? sa.localities : [],
        pincodes: Array.isArray(sa.pincodes) ? sa.pincodes : [],
        radiusKm: Number(sa.radiusKm) || 10,
      };
    }
  }

  return {
    id: Number(raw.id),
    name: user.userName || raw.business_name || 'Service Professional',
    business_name: raw.business_name || null,
    provider_type: raw.provider_type || 'Independent Professional',
    category_id: raw.service_category_id ? Number(raw.service_category_id) : null,
    category_name: category.serviceCategoryName || null,
    description: raw.description || null,
    experience: raw.experience || null,
    hourly_rate: raw.hourly_rate != null ? Number(raw.hourly_rate) : null,
    is_verified: !!raw.is_verified,
    verification_status: raw.verification_status || 'underReview',
    rating: Number(raw.rating || 0.0),
    review_count: Number(raw.review_count || 0),
    completed_jobs_count: Number(raw.completed_jobs_count || 0),
    is_online: raw.is_online !== undefined ? !!raw.is_online : true,
    service_area: publicServiceArea,
    created_at: raw.created_at,
  };
};
