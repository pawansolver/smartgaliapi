/**
 * FCM / Firebase Admin configuration (env-driven).
 * Never log private keys or full tokens.
 */

const toBool = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

/** Convert escaped \n in env private keys to real newlines. */
export const normalizePrivateKey = (raw) => {
  if (!raw) return '';
  return String(raw).replace(/\\n/g, '\n').trim();
};

export const fcmConfig = {
  enabled: toBool(process.env.FCM_ENABLED, false),
  notificationsEnabled: toBool(process.env.FCM_NOTIFICATION_ENABLED, true),
  /** Skip FCM when UserProfile.is_online is true (Socket.IO already delivered). */
  skipOnlineUsers: toBool(process.env.FCM_SKIP_ONLINE_USERS, true),
  projectId: (process.env.FCM_PROJECT_ID || '').trim(),
  clientEmail: (process.env.FCM_CLIENT_EMAIL || '').trim(),
  privateKey: normalizePrivateKey(process.env.FCM_PRIVATE_KEY || ''),
  integrationTest: toBool(process.env.FCM_INTEGRATION_TEST, false),
};

export const isFcmConfigured = () =>
  Boolean(
    fcmConfig.enabled
    && fcmConfig.projectId
    && fcmConfig.clientEmail
    && fcmConfig.privateKey,
  );

export default fcmConfig;
