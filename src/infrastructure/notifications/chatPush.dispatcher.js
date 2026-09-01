/**
 * Chat-specific FCM dispatch for message.created (mute, prefs, online skip).
 * Called from the outbox/BullMQ worker — never from the message TX.
 */

import { Op } from 'sequelize';
import ChatParticipant from '../../modules/chat_participant/chat_participant.model.js';
import NotificationPreference from '../../modules/profile/notification_preference.model.js';
import { resolveDisplayName } from '../../modules/notification/notification.service.js';
import { fcmConfig } from './fcm.config.js';
import * as pushService from './push.service.js';
import { cacheGet, cacheSet } from '../../config/redis.js';
import { getOnlineFlagsForPush } from '../presence/presence.js';
import { logger } from '../../utils/logger.js';

const DEDUPE_TTL_SECONDS = 86_400; // 24h — covers BullMQ retry windows

/** Mutable for tests. */
export const chatPushDeps = {
  findParticipants: (chatId, senderId) =>
    ChatParticipant.findAll({
      where: { chat_id: chatId, is_deleted: false, user_id: { [Op.ne]: senderId } },
      attributes: ['user_id', 'is_muted', 'muted_until'],
    }),
  resolveDisplayName: (userId) => resolveDisplayName(userId),
  getPreferencesMap: async (userIds) => {
    if (!userIds.length) return new Map();
    const rows = await NotificationPreference.findAll({
      where: { user_id: { [Op.in]: userIds }, is_deleted: false },
      attributes: ['user_id', 'community_chat'],
    });
    return new Map(rows.map((r) => [Number(r.user_id), r.community_chat !== false]));
  },
  /** Redis heartbeat first; stale DB is_online=true without Redis key ⇒ offline. */
  getOnlineFlags: (userIds) => getOnlineFlagsForPush(userIds),
  sendToUser: (args) => pushService.sendToUser(args),
  cacheGet: (key) => cacheGet(key),
  cacheSet: (key, value, ttl) => cacheSet(key, value, ttl),
};

const isMuteActive = (participant) => {
  if (!participant.is_muted) return false;
  if (participant.muted_until && new Date() > new Date(participant.muted_until)) {
    return false; // mute expired
  }
  return true;
};

const previewBody = (message) => {
  const raw = (message?.message || 'Sent an attachment').toString();
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
};

/**
 * After Socket.IO broadcast: push FCM to offline/unmuted recipients.
 *
 * @param {{ chatId: number|string, messageId: number|string, senderId: number|string, message?: object }} args
 */
export const dispatchChatMessagePush = async ({
  chatId,
  messageId,
  senderId,
  message,
}) => {
  if (!fcmConfig.enabled || !fcmConfig.notificationsEnabled) {
    return { skipped: true, reason: 'fcm_disabled' };
  }
  if (!chatId || !messageId || senderId == null) {
    return { skipped: true, reason: 'incomplete_payload' };
  }

  const participants = await chatPushDeps.findParticipants(chatId, senderId);
  const eligible = participants.filter((p) => !isMuteActive(p));
  if (!eligible.length) {
    return { sentUsers: 0, reason: 'all_muted_or_empty' };
  }

  const userIds = eligible.map((p) => Number(p.user_id));
  const [onlineMap, prefMap] = await Promise.all([
    fcmConfig.skipOnlineUsers
      ? chatPushDeps.getOnlineFlags(userIds)
      : Promise.resolve(new Map()),
    chatPushDeps.getPreferencesMap(userIds),
  ]);

  const senderName = await chatPushDeps.resolveDisplayName(senderId);
  const body = previewBody(message);
  const data = {
    type: 'chat_message',
    chatId: String(chatId),
    messageId: String(messageId),
  };

  let sentUsers = 0;
  let skippedOnline = 0;
  let skippedPref = 0;
  let retriableError = null;

  for (const userId of userIds) {
    if (fcmConfig.skipOnlineUsers && onlineMap.get(userId)) {
      skippedOnline += 1;
      continue;
    }

    // Missing preference row → allow (same as in-app notifications)
    if (prefMap.has(userId) && prefMap.get(userId) === false) {
      skippedPref += 1;
      continue;
    }

    const userDedupeKey = `fcm:msg:${messageId}:user:${userId}`;
    const already = await chatPushDeps.cacheGet(userDedupeKey);
    if (already) continue;

    try {
      const result = await chatPushDeps.sendToUser({
        userId,
        title: senderName,
        body,
        data,
      });
      if (result.sent > 0 || result.reason === 'no_devices') {
        await chatPushDeps.cacheSet(userDedupeKey, { ok: true }, DEDUPE_TTL_SECONDS);
      }
      if (result.sent > 0) sentUsers += 1;
    } catch (error) {
      if (error.retriable) {
        retriableError = error;
      } else {
        logger.warn('FCM', 'user_push_failed', {
          userId,
          messageId,
          error: error.message,
        });
      }
    }
  }

  if (retriableError) {
    // Per-user dedupe already set for successful users — retry only remaining
    throw retriableError;
  }

  logger.info('FCM', 'chat_push_dispatched', {
    chatId,
    messageId,
    sentUsers,
    skippedOnline,
    skippedPref,
  });

  return { sentUsers, skippedOnline, skippedPref };
};

export default { dispatchChatMessagePush };
