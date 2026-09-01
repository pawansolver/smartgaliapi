import { cacheGet, cacheSet, cacheDel } from '../../config/redis.js';

const TTL = Object.freeze({
  SOCIETY_DETAIL: 300,       // 5 minutes
  SOCIETY_FACILITIES: 600,   // 10 minutes
  SOCIETY_ANNOUNCEMENTS: 180,// 3 minutes
});

export const getCachedSocietyDetail = async (societyId) => {
  try {
    return await cacheGet(`society:detail:${societyId}`);
  } catch {
    return null;
  }
};

export const setCachedSocietyDetail = async (societyId, data) => {
  try {
    await cacheSet(`society:detail:${societyId}`, data, TTL.SOCIETY_DETAIL);
  } catch { /* graceful fallback */ }
};

export const invalidateSocietyDetailCache = async (societyId) => {
  try {
    await Promise.allSettled([
      cacheDel(`society:detail:${societyId}`),
      cacheDel(`society:facilities:${societyId}`),
      cacheDel(`society:announcements:${societyId}`),
    ]);
  } catch { /* graceful fallback */ }
};

export const getCachedFacilities = async (societyId) => {
  try {
    return await cacheGet(`society:facilities:${societyId}`);
  } catch {
    return null;
  }
};

export const setCachedFacilities = async (societyId, data) => {
  try {
    await cacheSet(`society:facilities:${societyId}`, data, TTL.SOCIETY_FACILITIES);
  } catch { /* graceful fallback */ }
};

export const invalidateFacilitiesCache = async (societyId) => {
  try {
    await cacheDel(`society:facilities:${societyId}`);
  } catch { /* graceful fallback */ }
};

export const getCachedAnnouncements = async (societyId) => {
  try {
    return await cacheGet(`society:announcements:${societyId}`);
  } catch {
    return null;
  }
};

export const setCachedAnnouncements = async (societyId, data) => {
  try {
    await cacheSet(`society:announcements:${societyId}`, data, TTL.SOCIETY_ANNOUNCEMENTS);
  } catch { /* graceful fallback */ }
};

export const invalidateAnnouncementsCache = async (societyId) => {
  try {
    await cacheDel(`society:announcements:${societyId}`);
  } catch { /* graceful fallback */ }
};

export default {
  getCachedSocietyDetail,
  setCachedSocietyDetail,
  invalidateSocietyDetailCache,
  getCachedFacilities,
  setCachedFacilities,
  invalidateFacilitiesCache,
  getCachedAnnouncements,
  setCachedAnnouncements,
  invalidateAnnouncementsCache,
};
