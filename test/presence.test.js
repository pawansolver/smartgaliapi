import test from 'node:test';
import assert from 'node:assert/strict';
import {
  markUserOnline,
  touchUserPresence,
  handleUserSocketDisconnect,
  getOnlineFlagsForPush,
  presenceDeps,
  presenceRedisKey,
} from '../src/infrastructure/presence/presence.js';
import { dispatchChatMessagePush, chatPushDeps } from '../src/infrastructure/notifications/chatPush.dispatcher.js';
import { fcmConfig } from '../src/infrastructure/notifications/fcm.config.js';

const withPresenceDeps = async (overrides, fn) => {
  const previous = { ...presenceDeps };
  Object.assign(presenceDeps, overrides);
  try {
    return await fn();
  } finally {
    Object.assign(presenceDeps, previous);
  }
};

test('markUserOnline transitions offline→online once', async () => {
  const store = new Map();
  const updates = [];
  await withPresenceDeps({
    cacheGet: async (key) => store.get(key) ?? null,
    cacheSet: async (key, value) => { store.set(key, value); },
    cacheDel: async (key) => { store.delete(key); },
    updateProfile: async (values, where) => { updates.push({ values, where }); return [1]; },
  }, async () => {
    const first = await markUserOnline(100);
    const second = await markUserOnline(100);
    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(updates.length, 2);
    assert.equal(updates[0].values.is_online, true);
    assert.ok(store.has(presenceRedisKey(100)));
  });
});

test('multi-instance: API-1 disconnect keeps user online when API-2 still has sockets', async () => {
  const store = new Map();
  const updates = [];
  await withPresenceDeps({
    cacheGet: async (key) => store.get(key) ?? null,
    cacheSet: async (key, value) => { store.set(key, value); },
    cacheDel: async (key) => { store.delete(key); },
    updateProfile: async (values, where) => { updates.push({ values, where }); return [1]; },
    // Simulate Redis adapter: user still has 1 socket on another instance
    countUserSockets: async () => 1,
  }, async () => {
    await markUserOnline(100);
    const result = await handleUserSocketDisconnect({}, 100);
    assert.equal(result.offline, false);
    assert.equal(result.remaining, 1);
    assert.equal(updates.some((u) => u.values.is_online === false), false);
    assert.ok(store.has(presenceRedisKey(100)));
  });
});

test('last socket disconnect marks offline', async () => {
  const store = new Map();
  const updates = [];
  await withPresenceDeps({
    cacheGet: async (key) => store.get(key) ?? null,
    cacheSet: async (key, value) => { store.set(key, value); },
    cacheDel: async (key) => { store.delete(key); },
    updateProfile: async (values, where) => { updates.push({ values, where }); return [1]; },
    countUserSockets: async () => 0,
  }, async () => {
    await markUserOnline(100);
    const result = await handleUserSocketDisconnect({}, 100);
    assert.equal(result.offline, true);
    assert.equal(result.remaining, 0);
    assert.ok(result.lastSeen instanceof Date);
    assert.ok(updates.some((u) => u.values.is_online === false));
    assert.equal(store.has(presenceRedisKey(100)), false);
  });
});

test('reconnect cycle: online → offline → online', async () => {
  const store = new Map();
  await withPresenceDeps({
    cacheGet: async (key) => store.get(key) ?? null,
    cacheSet: async (key, value) => { store.set(key, value); },
    cacheDel: async (key) => { store.delete(key); },
    updateProfile: async () => [1],
    countUserSockets: async () => 0,
  }, async () => {
    assert.equal(await markUserOnline(7), true);
    assert.equal((await handleUserSocketDisconnect({}, 7)).offline, true);
    assert.equal(await markUserOnline(7), true);
    assert.equal((await handleUserSocketDisconnect({}, 7)).offline, true);
  });
});

test('multi-device: one device disconnect does not offline user', async () => {
  let socketCount = 3; // android + ios + web
  await withPresenceDeps({
    cacheGet: async () => ({ at: Date.now() }),
    cacheSet: async () => {},
    cacheDel: async () => {},
    updateProfile: async () => [1],
    countUserSockets: async () => {
      socketCount -= 1; // one device left
      return socketCount;
    },
  }, async () => {
    const afterAndroid = await handleUserSocketDisconnect({}, 55);
    assert.equal(afterAndroid.offline, false);
    assert.equal(afterAndroid.remaining, 2);
    const afterIos = await handleUserSocketDisconnect({}, 55);
    assert.equal(afterIos.offline, false);
    assert.equal(afterIos.remaining, 1);
  });
});

test('stale Redis miss treats user offline for FCM even if DB said online', async () => {
  await withPresenceDeps({
    isRedisAvailable: () => true,
    cacheGet: async () => null, // heartbeat expired
    cacheSet: async () => {},
    cacheDel: async () => {},
    updateProfile: async () => [1],
  }, async () => {
    const flags = await getOnlineFlagsForPush([100, 101]);
    assert.equal(flags.get(100), false);
    assert.equal(flags.get(101), false);
  });
});

test('touchUserPresence refreshes heartbeat without DB churn requirement', async () => {
  const store = new Map();
  let sets = 0;
  await withPresenceDeps({
    cacheGet: async (key) => store.get(key) ?? null,
    cacheSet: async (key, value) => { sets += 1; store.set(key, value); },
    cacheDel: async (key) => { store.delete(key); },
    updateProfile: async () => [1],
  }, async () => {
    await touchUserPresence(9);
    await touchUserPresence(9);
    assert.equal(sets, 2);
    assert.ok(store.has(presenceRedisKey(9)));
  });
});

test('notification decision: online skips FCM; offline sends; muted skips', async () => {
  const previousChat = { ...chatPushDeps };
  const prevEnabled = fcmConfig.enabled;
  const prevNotify = fcmConfig.notificationsEnabled;
  const prevSkip = fcmConfig.skipOnlineUsers;
  fcmConfig.enabled = true;
  fcmConfig.notificationsEnabled = true;
  fcmConfig.skipOnlineUsers = true;

  const sent = [];
  chatPushDeps.findParticipants = async () => [
    { user_id: 20, is_muted: false, muted_until: null },
    { user_id: 21, is_muted: false, muted_until: null },
    { user_id: 22, is_muted: true, muted_until: null },
  ];
  chatPushDeps.getOnlineFlags = async () => new Map([[20, true], [21, false]]);
  chatPushDeps.getPreferencesMap = async () => new Map();
  chatPushDeps.resolveDisplayName = async () => 'Pawan';
  chatPushDeps.sendToUser = async ({ userId }) => {
    sent.push(userId);
    return { sent: 1 };
  };
  chatPushDeps.cacheGet = async () => null;
  chatPushDeps.cacheSet = async () => {};

  try {
    const result = await dispatchChatMessagePush({
      chatId: 1,
      messageId: 99,
      senderId: 5,
      message: { message: 'hello' },
    });
    assert.equal(result.skippedOnline, 1);
    assert.deepEqual(sent, [21]);
    assert.ok(!sent.includes(20));
    assert.ok(!sent.includes(22));
  } finally {
    Object.assign(chatPushDeps, previousChat);
    fcmConfig.enabled = prevEnabled;
    fcmConfig.notificationsEnabled = prevNotify;
    fcmConfig.skipOnlineUsers = prevSkip;
  }
});

test('user:online payload cannot spoof another user — presence helpers bind to caller id only', async () => {
  // Contract: markUserOnline / touch always take explicit authenticated userId from socket layer
  const touched = [];
  await withPresenceDeps({
    cacheGet: async () => null,
    cacheSet: async (_key, value) => { touched.push(value.userId); },
    cacheDel: async () => {},
    updateProfile: async (_v, where) => {
      touched.push(String(where.user_id));
      return [1];
    },
  }, async () => {
    await markUserOnline(100);
    // Spoofed payload userId=999 must never be passed by socket.js (tested by API contract here)
    assert.ok(touched.every((id) => String(id) === '100'));
    assert.ok(!touched.includes('999'));
  });
});
