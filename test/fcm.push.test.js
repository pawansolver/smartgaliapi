import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fcmConfig,
  normalizePrivateKey,
  isPermanentTokenError,
  isTransientFcmError,
  resetFcmClientForTests,
  sendToDevice,
  sendToDevices,
  sendToUser,
  pushServiceDeps,
  dispatchChatMessagePush,
  chatPushDeps,
} from '../src/infrastructure/notifications/index.js';
import {
  handleMessageCreatedPush,
  notificationHandlerDeps,
} from '../src/workers/notification.handler.js';
import { processorDeps } from '../src/modules/outbox/outbox.processor.js';

test('normalizePrivateKey converts escaped newlines', () => {
  const key = normalizePrivateKey('-----BEGIN\\nKEY\\n-----END');
  assert.equal(key.includes('\n'), true);
  assert.equal(key.includes('\\n'), false);
});

test('fcmConfig defaults keep FCM disabled in unit tests unless env set', () => {
  // Module already loaded — assert shape only
  assert.equal(typeof fcmConfig.enabled, 'boolean');
  assert.equal(typeof fcmConfig.skipOnlineUsers, 'boolean');
});

test('isPermanentTokenError detects invalid registration tokens', () => {
  assert.equal(
    isPermanentTokenError({ code: 'messaging/registration-token-not-registered' }),
    true,
  );
  assert.equal(
    isPermanentTokenError({ code: 'messaging/invalid-registration-token' }),
    true,
  );
  assert.equal(isPermanentTokenError({ code: 'messaging/server-unavailable' }), false);
});

test('isTransientFcmError is true for unavailable errors', () => {
  assert.equal(isTransientFcmError({ code: 'messaging/server-unavailable' }), true);
});

test('sendToDevice deactivates permanent invalid tokens', async () => {
  resetFcmClientForTests();
  const previous = { ...pushServiceDeps };
  const deactivated = [];
  pushServiceDeps.getMessaging = () => ({
    send: async () => {
      const err = new Error('not registered');
      err.code = 'messaging/registration-token-not-registered';
      throw err;
    },
  });
  pushServiceDeps.deactivateByToken = async (token, reason) => {
    deactivated.push({ token, reason });
    return 1;
  };

  // Force enabled path via temporary config mutation
  const prevEnabled = fcmConfig.enabled;
  const prevNotify = fcmConfig.notificationsEnabled;
  fcmConfig.enabled = true;
  fcmConfig.notificationsEnabled = true;

  try {
    const result = await sendToDevice({
      token: 'dead-token-xxxxxxxxxxxxxxxxxxxx',
      title: 'Hi',
      body: 'Test',
      data: { type: 'chat_message' },
    });
    assert.equal(result.ok, false);
    assert.equal(result.permanent, true);
    assert.equal(deactivated.length, 1);
    assert.equal(deactivated[0].token, 'dead-token-xxxxxxxxxxxxxxxxxxxx');
  } finally {
    Object.assign(pushServiceDeps, previous);
    fcmConfig.enabled = prevEnabled;
    fcmConfig.notificationsEnabled = prevNotify;
  }
});

test('sendToDevice throws retriable on transient FCM errors', async () => {
  const previous = { ...pushServiceDeps };
  pushServiceDeps.getMessaging = () => ({
    send: async () => {
      const err = new Error('unavailable');
      err.code = 'messaging/server-unavailable';
      throw err;
    },
  });
  const prevEnabled = fcmConfig.enabled;
  const prevNotify = fcmConfig.notificationsEnabled;
  fcmConfig.enabled = true;
  fcmConfig.notificationsEnabled = true;

  try {
    await assert.rejects(
      () => sendToDevice({ token: 'tok-yyyyyyyyyyyyyyyyyyyy', title: 'a', body: 'b' }),
      (err) => err.retriable === true,
    );
  } finally {
    Object.assign(pushServiceDeps, previous);
    fcmConfig.enabled = prevEnabled;
    fcmConfig.notificationsEnabled = prevNotify;
  }
});

test('transient FCM failure surfaces for BullMQ retry then succeeds', async () => {
  const previous = notificationHandlerDeps.dispatchChatMessagePush;
  let attempts = 0;
  notificationHandlerDeps.dispatchChatMessagePush = async () => {
    attempts += 1;
    if (attempts === 1) {
      const err = new Error('unavailable');
      err.retriable = true;
      throw err;
    }
    return { sentUsers: 1 };
  };

  try {
    await assert.rejects(
      () => handleMessageCreatedPush({
        chatId: 1, messageId: 2, senderId: 3, message: { message: 'x' },
      }),
      (err) => err.retriable === true,
    );
    const second = await handleMessageCreatedPush({
      chatId: 1, messageId: 2, senderId: 3, message: { message: 'x' },
    });
    assert.equal(second.sentUsers, 1);
    assert.equal(attempts, 2);
  } finally {
    notificationHandlerDeps.dispatchChatMessagePush = previous;
  }
});

test('sendToDevices and sendToUser fan out to active devices', async () => {
  const previous = { ...pushServiceDeps };
  const sent = [];
  pushServiceDeps.getMessaging = () => ({
    send: async (msg) => { sent.push(msg.token); return 'ok'; },
  });
  pushServiceDeps.getActiveUserDevices = async () => [
    { push_token: 'tok-11111111111111111111' },
    { push_token: 'tok-22222222222222222222' },
  ];
  const prevEnabled = fcmConfig.enabled;
  const prevNotify = fcmConfig.notificationsEnabled;
  fcmConfig.enabled = true;
  fcmConfig.notificationsEnabled = true;

  try {
    const multi = await sendToDevices({
      tokens: ['tok-11111111111111111111', 'tok-22222222222222222222'],
      title: 'Pawan',
      body: 'Hello',
      data: { chatId: '45', messageId: '501', type: 'chat_message' },
    });
    assert.equal(multi.sent, 2);

    const user = await sendToUser({
      userId: 10,
      title: 'Pawan',
      body: 'Hello',
      data: { type: 'chat_message' },
    });
    assert.equal(user.sent, 2);
  } finally {
    Object.assign(pushServiceDeps, previous);
    fcmConfig.enabled = prevEnabled;
    fcmConfig.notificationsEnabled = prevNotify;
  }
});

test('muted chat does not send FCM', async () => {
  const previous = { ...chatPushDeps };
  const sent = [];
  chatPushDeps.findParticipants = async () => [
    { user_id: 20, is_muted: true, muted_until: null },
  ];
  chatPushDeps.sendToUser = async () => { sent.push(1); return { sent: 1 }; };
  chatPushDeps.cacheGet = async () => null;
  chatPushDeps.cacheSet = async () => {};
  const prevEnabled = fcmConfig.enabled;
  const prevNotify = fcmConfig.notificationsEnabled;
  fcmConfig.enabled = true;
  fcmConfig.notificationsEnabled = true;

  try {
    const result = await dispatchChatMessagePush({
      chatId: 1,
      messageId: 9,
      senderId: 5,
      message: { message: 'hi' },
    });
    assert.equal(result.sentUsers, 0);
    assert.equal(result.reason, 'all_muted_or_empty');
    assert.equal(sent.length, 0);
  } finally {
    Object.assign(chatPushDeps, previous);
    fcmConfig.enabled = prevEnabled;
    fcmConfig.notificationsEnabled = prevNotify;
  }
});

test('offline user receives FCM; online user skipped when configured', async () => {
  const previous = { ...chatPushDeps };
  const sentUsers = [];
  chatPushDeps.findParticipants = async () => [
    { user_id: 20, is_muted: false, muted_until: null },
    { user_id: 21, is_muted: false, muted_until: null },
  ];
  chatPushDeps.getOnlineFlags = async () => new Map([[20, true], [21, false]]);
  chatPushDeps.getPreferencesMap = async () => new Map();
  chatPushDeps.resolveDisplayName = async () => 'Pawan';
  chatPushDeps.sendToUser = async ({ userId }) => {
    sentUsers.push(userId);
    return { sent: 1 };
  };
  chatPushDeps.cacheGet = async () => null;
  chatPushDeps.cacheSet = async () => {};
  const prevEnabled = fcmConfig.enabled;
  const prevNotify = fcmConfig.notificationsEnabled;
  const prevSkip = fcmConfig.skipOnlineUsers;
  fcmConfig.enabled = true;
  fcmConfig.notificationsEnabled = true;
  fcmConfig.skipOnlineUsers = true;

  try {
    const result = await dispatchChatMessagePush({
      chatId: 45,
      messageId: 501,
      senderId: 5,
      message: { message: 'Hello Rahul' },
    });
    assert.equal(result.skippedOnline, 1);
    assert.deepEqual(sentUsers, [21]);
  } finally {
    Object.assign(chatPushDeps, previous);
    fcmConfig.enabled = prevEnabled;
    fcmConfig.notificationsEnabled = prevNotify;
    fcmConfig.skipOnlineUsers = prevSkip;
  }
});

test('notification worker handler routes message.created to push dispatcher', async () => {
  const previous = notificationHandlerDeps.dispatchChatMessagePush;
  let called = null;
  notificationHandlerDeps.dispatchChatMessagePush = async (args) => {
    called = args;
    return { sentUsers: 1 };
  };

  try {
    const result = await handleMessageCreatedPush({
      chatId: 1,
      messageId: 2,
      senderId: 3,
      message: { message: 'x' },
    });
    assert.equal(result.sentUsers, 1);
    assert.equal(called.chatId, 1);
  } finally {
    notificationHandlerDeps.dispatchChatMessagePush = previous;
  }
});

test('processorDeps push hook is invoked from message.created path contract', () => {
  assert.equal(typeof processorDeps.handleMessageCreatedPush, 'function');
});
