/**
 * Singleton Firebase Admin / FCM messaging client.
 */

import admin from 'firebase-admin';
import { fcmConfig, isFcmConfigured } from './fcm.config.js';
import { logger } from '../../utils/logger.js';

let app = null;
let messaging = null;
let initAttempted = false;
let initError = null;

/** Mutable for unit tests. */
export const fcmClientDeps = {
  initializeApp: (options, name) => admin.initializeApp(options, name),
  getMessaging: (instance) => admin.messaging(instance),
  getApps: () => admin.apps,
};

/**
 * Initialize Firebase Admin once. Safe to call repeatedly.
 * When FCM is disabled, returns null (dev/test mode).
 * When enabled but misconfigured, throws a clear error.
 */
export const initFcm = () => {
  if (messaging) return messaging;
  if (initAttempted && initError) throw initError;
  if (initAttempted && !fcmConfig.enabled) return null;

  initAttempted = true;

  if (!fcmConfig.enabled) {
    logger.info('FCM', 'disabled', { reason: 'FCM_ENABLED=false' });
    return null;
  }

  if (!isFcmConfigured()) {
    initError = new Error(
      'FCM_ENABLED=true but FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY are incomplete.',
    );
    throw initError;
  }

  try {
    const existing = fcmClientDeps.getApps()?.find((a) => a?.name === 'smartgali-fcm');
    if (existing) {
      app = existing;
    } else {
      app = fcmClientDeps.initializeApp(
        {
          credential: admin.credential.cert({
            projectId: fcmConfig.projectId,
            clientEmail: fcmConfig.clientEmail,
            privateKey: fcmConfig.privateKey,
          }),
          projectId: fcmConfig.projectId,
        },
        'smartgali-fcm',
      );
    }
    messaging = fcmClientDeps.getMessaging(app);
    logger.info('FCM', 'initialized', { projectId: fcmConfig.projectId });
    return messaging;
  } catch (error) {
    initError = new Error(`FCM initialization failed: ${error.message}`);
    throw initError;
  }
};

export const getFcmMessaging = () => {
  if (messaging) return messaging;
  return initFcm();
};

export const isFcmReady = () => {
  try {
    return Boolean(getFcmMessaging());
  } catch {
    return false;
  }
};

/** Reset singleton (tests only). */
export const resetFcmClientForTests = () => {
  app = null;
  messaging = null;
  initAttempted = false;
  initError = null;
};

/**
 * Permanent FCM token errors that should deactivate the device.
 * @see https://firebase.google.com/docs/cloud-messaging/manage-tokens
 */
export const isPermanentTokenError = (error) => {
  const code = error?.code || error?.errorInfo?.code || '';
  const permanent = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'messaging/invalid-argument',
  ]);
  return permanent.has(String(code));
};

export const isTransientFcmError = (error) => {
  if (isPermanentTokenError(error)) return false;
  const code = String(error?.code || error?.errorInfo?.code || '');
  if (code.includes('unavailable') || code.includes('internal') || code.includes('quota')) {
    return true;
  }
  // Unknown errors: treat as transient so BullMQ can retry
  return true;
};

export default { initFcm, getFcmMessaging, isFcmReady };
