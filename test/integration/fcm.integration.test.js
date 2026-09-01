/**
 * Optional REAL FCM integration tests (opt-in only).
 *
 * Required env:
 *   FCM_INTEGRATION_TEST=true
 *   FCM_ENABLED=true
 *   FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY
 *   FCM_TEST_DEVICE_TOKEN   (real device token — never commit)
 *
 * Device delivery confirmation (operator saw the notification):
 *   FCM_DEVICE_DELIVERY_CONFIRMED=true
 *
 *   npm run test:fcm:integration
 *
 * Not part of `npm test`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fcmConfig,
  isFcmConfigured,
  initFcm,
  resetFcmClientForTests,
  sendToDevice,
  pushServiceDeps,
} from '../../src/infrastructure/notifications/index.js';

const maskToken = (token) => {
  if (!token || typeof token !== 'string') return '[empty]';
  if (token.length <= 8) return '***';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
};

const credentialsReady = process.env.FCM_INTEGRATION_TEST === 'true'
  && fcmConfig.enabled
  && isFcmConfigured();

const deviceTokenReady = credentialsReady && Boolean(process.env.FCM_TEST_DEVICE_TOKEN);
const deliveryConfirmed = process.env.FCM_DEVICE_DELIVERY_CONFIRMED === 'true';

test('real FCM smoke: Admin SDK accepts test notification', async (t) => {
  if (!deviceTokenReady) {
    t.skip(
      'Set FCM_INTEGRATION_TEST=true, FCM_* credentials, and FCM_TEST_DEVICE_TOKEN (never commit the token).',
    );
    return;
  }

  resetFcmClientForTests();
  initFcm();

  const token = process.env.FCM_TEST_DEVICE_TOKEN;
  console.log(`FCM smoke: sending to token=${maskToken(token)} project=${fcmConfig.projectId}`);

  const result = await sendToDevice({
    token,
    title: 'SmartGali Test',
    body: 'Phase 6 FCM smoke test',
    data: { type: 'fcm_smoke_test' },
  });

  assert.equal(result.ok, true, `FCM request must be accepted: ${JSON.stringify({
    ok: result.ok,
    permanent: result.permanent,
    error: result.error,
  })}`);
  console.log('FCM smoke: request accepted by Firebase Admin SDK');
});

test('real FCM device delivery confirmed by operator', async (t) => {
  if (!deviceTokenReady) {
    t.skip('Credentials/device token not configured');
    return;
  }
  if (!deliveryConfirmed) {
    t.skip(
      'After the device shows "SmartGali Test / Phase 6 FCM smoke test", '
      + 're-run with FCM_DEVICE_DELIVERY_CONFIRMED=true',
    );
    return;
  }
  // Operator attestation — do not claim delivery from FCM accept alone
  assert.equal(deliveryConfirmed, true);
  console.log('FCM smoke: operator confirmed notification on real device');
});

test('real FCM invalid token returns permanent failure and deactivates device', async (t) => {
  if (!credentialsReady) {
    t.skip('FCM credentials not configured');
    return;
  }

  resetFcmClientForTests();
  initFcm();

  const deactivated = [];
  const previousDeactivate = pushServiceDeps.deactivateByToken;
  pushServiceDeps.deactivateByToken = async (token, reason) => {
    deactivated.push({ token: maskToken(token), reason });
    return 1;
  };

  const prevEnabled = fcmConfig.enabled;
  const prevNotify = fcmConfig.notificationsEnabled;
  fcmConfig.enabled = true;
  fcmConfig.notificationsEnabled = true;

  try {
    const bogus = process.env.FCM_TEST_INVALID_TOKEN
      || 'smartgali-invalid-token-for-phase6-hardening-only';
    const result = await sendToDevice({
      token: bogus,
      title: 'SmartGali Test',
      body: 'Invalid token probe',
      data: { type: 'fcm_smoke_test' },
    });

    assert.equal(result.ok, false);
    assert.equal(result.permanent, true);
    assert.equal(deactivated.length, 1);
    console.log('FCM invalid-token: permanent error → device deactivation hook invoked');
  } finally {
    pushServiceDeps.deactivateByToken = previousDeactivate;
    fcmConfig.enabled = prevEnabled;
    fcmConfig.notificationsEnabled = prevNotify;
  }
});
