/**
 * Public Service & Provider Projections (DTO Mappers)
 * ─────────────────────────────────────────────────────────────────────────────
 * Protects internal models, PII, and sensitive records from leaking to
 * unauthenticated Guest or Resident discovery endpoints.
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
      };
    }
  }

  return {
    id: Number(raw.id),
    title: raw.title || 'Untitled Service',
    description: raw.description || null,
    price: raw.price != null ? Number(raw.price) : null,
    duration: raw.duration || null,
    is_available: !!raw.is_available,
    moderation_status: raw.moderation_status || 'approved',
    category_id: raw.category_id ? Number(raw.category_id) : (provider.service_category_id ? Number(provider.service_category_id) : null),
    category_name: category.serviceCategoryName || 'General',
    category_image: category.serviceCategoryImage || null,
    service_subcategory_id: raw.service_subcategory_id ? Number(raw.service_subcategory_id) : null,
    subcategory_name: raw.subcategory?.service_subcategory_name || null,
    highlights: Array.isArray(highlights) ? highlights : [],
    safe_terms: raw.safe_terms || null,
    images: Array.isArray(images) ? images : [],
    rating: Number(raw.rating || 0.0),
    reviews_count: Number(raw.reviews_count || 0),
    bookings_count: Number(raw.bookings_count || 0),
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
