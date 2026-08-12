/**
 * Generic FCM push service (no chat business rules).
 */

import { fcmConfig } from './fcm.config.js';
import {
  getFcmMessaging,
  isPermanentTokenError,
  isTransientFcmError,
} from './fcm.client.js';
import { logger } from '../../utils/logger.js';
import * as deviceService from '../../modules/user_devices/user_device.service.js';

const maskToken = (token) => {
  if (!token || typeof token !== 'string') return '[empty]';
  if (token.length <= 8) return '***';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
};

/** Mutable deps for tests. */
export const pushServiceDeps = {
  getMessaging: () => getFcmMessaging(),
  getActiveUserDevices: (userId) => deviceService.getActiveUserDevices(userId),
  deactivateByToken: (token, reason) => deviceService.deactivateByPushToken(token, reason),
};

/**
 * Send to a single device token.
 * @returns {{ ok: boolean, permanent?: boolean, error?: string }}
 */
export const sendToDevice = async ({
  token,
  title,
  body,
  data = {},
  android = {},
  apns = {},
}) => {
  if (!fcmConfig.enabled || !fcmConfig.notificationsEnabled) {
    return { ok: false, skipped: true, reason: 'fcm_disabled' };
  }
  if (!token) return { ok: false, skipped: true, reason: 'missing_token' };

  const messaging = pushServiceDeps.getMessaging();
  if (!messaging) return { ok: false, skipped: true, reason: 'fcm_unavailable' };

  const stringData = Object.fromEntries(
    Object.entries(data || {}).map(([k, v]) => [k, v == null ? '' : String(v)]),
  );

  try {
    await messaging.send({
      token,
      notification: title || body ? { title: title || '', body: body || '' } : undefined,
      data: stringData,
      android: {
        priority: 'high',
        ...android,
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            ...(apns.aps || {}),
          },
        },
        ...apns,
      },
    });
    return { ok: true };
  } catch (error) {
    const permanent = isPermanentTokenError(error);
    logger.warn('FCM', 'send_failed', {
      token: maskToken(token),
      permanent,
      code: error?.code || error?.errorInfo?.code || null,
      // never log private keys or full tokens
      error: error.message,
    });

    if (permanent) {
      await pushServiceDeps.deactivateByToken(token, error.code || 'invalid_token').catch(() => {});
      return { ok: false, permanent: true, error: error.message };
    }

    if (isTransientFcmError(error)) {
      const err = new Error(error.message || 'Transient FCM error');
      err.retriable = true;
      err.code = error.code;
      throw err;
    }

    return { ok: false, permanent: false, error: error.message };
  }
};

/**
 * Send the same payload to many tokens (sequential; deactivates invalids).
 */
export const sendToDevices = async ({ tokens, title, body, data }) => {
  const unique = [...new Set((tokens || []).filter(Boolean))];
  const results = [];
  let retriableError = null;

  for (const token of unique) {
    try {
      results.push(await sendToDevice({ token, title, body, data }));
    } catch (error) {
      if (error.retriable) {
        retriableError = error;
        results.push({ ok: false, retriable: true, error: error.message });
      } else {
        results.push({ ok: false, error: error.message });
      }
    }
  }

  if (retriableError && results.every((r) => !r.ok)) {
    throw retriableError;
  }

  return {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
  };
};

/**
 * Load active devices for a user and send.
 */
export const sendToUser = async ({ userId, title, body, data }) => {
  const devices = await pushServiceDeps.getActiveUserDevices(userId);
  const tokens = devices.map((d) => d.push_token).filter(Boolean);
  if (!tokens.length) {
    return { sent: 0, failed: 0, skipped: 0, results: [], reason: 'no_devices' };
  }
  return sendToDevices({ tokens, title, body, data });
};

export default { sendToDevice, sendToDevices, sendToUser };
