/**
 * Redis Cache-Aside Subsystem for Events Module
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides deterministic caching for Event Details, Categories, Upcoming and
 * Nearby feeds with granular invalidation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { cacheGet, cacheSet, cacheDel } from '../../config/redis.js';
import crypto from 'crypto';

const TTL = {
  EVENT_DETAIL: 300,       // 5 minutes
  EVENT_CATEGORIES: 3600,  // 1 hour
  EVENT_FEED: 180,         // 3 minutes
};

const hashKey = (data) => {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
};

export const getCachedEvent = async (id) => {
  try {
    return await cacheGet(`event:detail:${id}`);
  } catch {
    return null;
  }
};

export const setCachedEvent = async (id, event) => {
  try {
    await cacheSet(`event:detail:${id}`, event, TTL.EVENT_DETAIL);
  } catch { /* graceful fallback */ }
};

export const getCachedCategories = async () => {
  try {
    return await cacheGet('event:categories');
  } catch {
    return null;
  }
};

export const setCachedCategories = async (categories) => {
  try {
    await cacheSet('event:categories', categories, TTL.EVENT_CATEGORIES);
  } catch { /* graceful fallback */ }
};

export const getCachedFeed = async (prefix, filterParams) => {
  try {
    const key = `event:feed:${prefix}:${hashKey(filterParams)}`;
    return await cacheGet(key);
  } catch {
    return null;
  }
};

export const setCachedFeed = async (prefix, filterParams, data) => {
  try {
    const key = `event:feed:${prefix}:${hashKey(filterParams)}`;
    await cacheSet(key, data, TTL.EVENT_FEED);
  } catch { /* graceful fallback */ }
};

export const invalidateEventCaches = async (eventId, communityId = null) => {
  try {
    const promises = [];
    if (eventId) {
      promises.push(cacheDel(`event:detail:${eventId}`));
    }
    if (communityId) {
      promises.push(cacheDel(`community:events:${communityId}`));
    }
    await Promise.allSettled(promises);
  } catch { /* graceful fallback */ }
};
