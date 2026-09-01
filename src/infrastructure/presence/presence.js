/**
 * Cross-instance online presence helpers.
 *
 * Socket.IO Redis adapter fans out room membership; this module:
 *  - refreshes a short Redis TTL heartbeat (stale-online protection)
 *  - updates UserProfile.is_online only when cluster-wide sockets go idle
 *
 * Does NOT replace Socket.IO / Redis adapter — complements them.
 */

import UserProfile from '../../modules/userProfile/userProfile.model.js';
import { cacheDel, cacheGet, cacheSet, getIsRedisAvailable } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';

/** Heartbeat TTL — must be > client/server refresh interval. */
export const PRESENCE_TTL_SECONDS = Number(process.env.PRESENCE_TTL_SECONDS) || 90;

export const presenceRedisKey = (userId) => `presence:online:${userId}`;

/** Mutable for tests. */
export const presenceDeps = {
  cacheGet: (key) => cacheGet(key),
  cacheSet: (key, value, ttl) => cacheSet(key, value, ttl),
  cacheDel: (key) => cacheDel(key),
  isRedisAvailable: () => getIsRedisAvailable(),
  updateProfile: (values, where) => UserProfile.update(values, { where }),
  /**
   * Cluster-wide socket count for a user room (Redis adapter aware).
   * @type {(io: import('socket.io').Server, userId: string) => Promise<number>}
   */
  countUserSockets: async (io, userId) => {
    if (!io?.in) return 0;
    try {
      const sockets = await io.in(`user:${userId}`).fetchSockets();
      return sockets.length;
    } catch (error) {
      logger.warn('PRESENCE', 'fetch_sockets_failed', {
        userId,
        error: error.message,
      });
      return 0;
    }
  },
};

/**
 * Mark user online in Redis (+ DB). Returns whether this was a transition
 * from offline → online (for emitting presence:online once).
 */
export const markUserOnline = async (userId) => {
  const key = presenceRedisKey(userId);
  const prior = await presenceDeps.cacheGet(key);
  await presenceDeps.cacheSet(key, { userId: String(userId), at: Date.now() }, PRESENCE_TTL_SECONDS);
  try {
    await presenceDeps.updateProfile({ is_online: true }, { user_id: userId });
  } catch (error) {
    logger.error('PRESENCE', 'mark_online_failed', { userId, error: error.message });
  }
  return !prior;
};

/** Refresh Redis TTL while sockets remain connected (crash/stale protection). */
export const touchUserPresence = async (userId) => {
  const key = presenceRedisKey(userId);
  await presenceDeps.cacheSet(key, { userId: String(userId), at: Date.now() }, PRESENCE_TTL_SECONDS);
};

/**
 * After a local socket disconnect: only mark offline if NO sockets remain
 * for this user across all API instances (via Redis adapter fetchSockets).
 */
export const handleUserSocketDisconnect = async (io, userId) => {
  const remaining = await presenceDeps.countUserSockets(io, userId);
  if (remaining > 0) {
    await touchUserPresence(userId);
    return { offline: false, remaining };
  }

  const lastSeen = new Date();
  await presenceDeps.cacheDel(presenceRedisKey(userId));
  try {
    await presenceDeps.updateProfile(
      { is_online: false, last_seen: lastSeen },
      { user_id: userId },
    );
  } catch (error) {
    logger.error('PRESENCE', 'mark_offline_failed', { userId, error: error.message });
  }
  return { offline: true, remaining: 0, lastSeen };
};

/**
 * Online flags for FCM skip decisions.
 * Prefer live Redis heartbeat; missing key ⇒ offline (clears stale DB true).
 * If Redis unavailable, fall back to UserProfile.is_online.
 */
export const getOnlineFlagsForPush = async (userIds, { loadDbFlags } = {}) => {
  const ids = [...new Set((userIds || []).map((id) => Number(id)).filter((n) => Number.isFinite(n)))];
  const map = new Map();
  if (!ids.length) return map;

  if (presenceDeps.isRedisAvailable()) {
    await Promise.all(ids.map(async (id) => {
      const live = await presenceDeps.cacheGet(presenceRedisKey(id));
      map.set(id, Boolean(live));
    }));
    return map;
  }

  if (typeof loadDbFlags === 'function') {
    return loadDbFlags(ids);
  }

  const rows = await UserProfile.findAll({
    where: { user_id: ids },
    attributes: ['user_id', 'is_online'],
  });
  for (const row of rows) {
    map.set(Number(row.user_id), !!row.is_online);
  }
  for (const id of ids) {
    if (!map.has(id)) map.set(id, false);
  }
  return map;
};

export default {
  markUserOnline,
  touchUserPresence,
  handleUserSocketDisconnect,
  getOnlineFlagsForPush,
  PRESENCE_TTL_SECONDS,
};
