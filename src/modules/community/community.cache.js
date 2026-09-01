import { cacheGet, cacheSet, cacheDel } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';

const TTL_COMMUNITY_DETAIL = 300;     // 5 minutes
const TTL_CATEGORIES = 3600;          // 1 hour
const TTL_SUGGESTED = 120;            // 2 minutes

export const getCommunityDetailCache = async (communityId) => {
  try {
    return await cacheGet(`community:detail:${communityId}`);
  } catch {
    return null;
  }
};

export const setCommunityDetailCache = async (communityId, data) => {
  try {
    await cacheSet(`community:detail:${communityId}`, data, TTL_COMMUNITY_DETAIL);
  } catch { /* graceful fallback */ }
};

export const invalidateCommunityDetailCache = async (communityId) => {
  try {
    await cacheDel(`community:detail:${communityId}`);
  } catch { /* graceful fallback */ }
};

export const invalidateCommunityMemberCache = async (communityId, userId) => {
  try {
    await Promise.allSettled([
      cacheDel(`community:detail:${communityId}`),
      cacheDel(`community:my:${userId}`),
      cacheDel(`community:suggested:${userId}`),
    ]);
  } catch { /* graceful fallback */ }
};

export const invalidateCommunityCategoriesCache = async () => {
  try {
    await cacheDel('community:categories');
  } catch { /* graceful fallback */ }
};
