import test from 'node:test';
import assert from 'node:assert/strict';
import UserDevice from '../src/modules/user_devices/user_device.model.js';
import * as deviceService from '../src/modules/user_devices/user_device.service.js';
import {
  registerDeviceSchema,
  updateDeviceSchema,
} from '../src/modules/user_devices/user_device.validation.js';
import { up as upDevices, down as downDevices, version as devicesVersion } from '../scripts/migrations/007-user-devices.js';

const makeRow = (overrides = {}) => {
  const row = {
    id: 1,
    user_id: 10,
    device_id: 'device-a',
    platform: 'android',
    push_token: 'token-aaaaaaaaaaaaaaaaaaaa',
    app_version: '1.0.0',
    device_model: 'Pixel',
    is_active: true,
    last_seen_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    deactivated_reason: null,
    save: async function save() { return this; },
    ...overrides,
  };
  return row;
};

test('registerDeviceSchema validates platform and token length', () => {
  const ok = registerDeviceSchema.validate({
    deviceId: 'dev-1',
    platform: 'android',
    pushToken: 'x'.repeat(40),
  });
  assert.equal(ok.error, undefined);

  const bad = registerDeviceSchema.validate({
    deviceId: 'dev-1',
    platform: 'windows',
    pushToken: 'short',
  });
  assert.ok(bad.error);
});

test('updateDeviceSchema requires at least pushToken or metadata', () => {
  const empty = updateDeviceSchema.validate({});
  assert.ok(empty.error);
});

test('registerDevice creates a new device for the authenticated user', async (t) => {
  t.mock.method(UserDevice, 'findOne', async () => null);
  t.mock.method(UserDevice, 'update', async () => [0]);
  let created = null;
  t.mock.method(UserDevice, 'create', async (data) => {
    created = makeRow({ ...data, id: 99 });
    return created;
  });

  const result = await deviceService.registerDevice({
    userId: 10,
    deviceId: 'device-a',
    platform: 'android',
    pushToken: 'token-aaaaaaaaaaaaaaaaaaaa',
    appVersion: '1.0.0',
    deviceModel: 'Pixel',
  });

  assert.equal(result.created, true);
  assert.equal(result.device.deviceId, 'device-a');
  assert.equal(result.device.platform, 'android');
  assert.ok(result.device.pushTokenHint);
  assert.equal(created.user_id, 10);
});

test('registerDevice is idempotent and rotates token on same device', async (t) => {
  const existing = makeRow({ push_token: 'old-token-bbbbbbbbbbbbbbbbbb' });
  t.mock.method(UserDevice, 'findOne', async () => existing);

  const result = await deviceService.registerDevice({
    userId: 10,
    deviceId: 'device-a',
    platform: 'ios',
    pushToken: 'new-token-cccccccccccccccccc',
  });

  assert.equal(result.created, false);
  assert.equal(existing.push_token, 'new-token-cccccccccccccccccc');
  assert.equal(existing.platform, 'ios');
  assert.equal(existing.is_active, true);
});

test('multiple devices per user are supported', async (t) => {
  t.mock.method(UserDevice, 'findAll', async () => [
    makeRow({ id: 1, device_id: 'android-1', platform: 'android' }),
    makeRow({ id: 2, device_id: 'ios-1', platform: 'ios' }),
    makeRow({ id: 3, device_id: 'tablet-1', platform: 'android' }),
  ]);

  const devices = await deviceService.getUserDevices(10);
  assert.equal(devices.length, 3);
  assert.ok(!('pushToken' in devices[0]));
});

test('deactivateDevice marks only that device inactive', async (t) => {
  const existing = makeRow();
  t.mock.method(UserDevice, 'findOne', async () => existing);

  const result = await deviceService.deactivateDevice({
    userId: 10,
    deviceId: 'device-a',
    reason: 'user_logout',
  });

  assert.equal(result.device.isActive, false);
  assert.equal(existing.deactivated_reason, 'user_logout');
});

test('removeDevice deletes the callers device only', async (t) => {
  let where = null;
  t.mock.method(UserDevice, 'destroy', async (opts) => {
    where = opts.where;
    return 1;
  });

  const result = await deviceService.removeDevice({ userId: 10, deviceId: 'device-a' });
  assert.equal(result.ok, true);
  assert.equal(where.user_id, 10);
  assert.equal(where.device_id, 'device-a');
});

test('User A cannot modify User B device (service scopes by userId)', async (t) => {
  t.mock.method(UserDevice, 'findOne', async (opts) => {
    assert.equal(opts.where.user_id, 10);
    return null;
  });

  const result = await deviceService.updateDeviceToken({
    userId: 10,
    deviceId: 'device-owned-by-11',
    pushToken: 'token-dddddddddddddddddddd',
  });
  assert.equal(result.status, 404);
});

test('deactivateByPushToken deactivates invalid tokens', async (t) => {
  t.mock.method(UserDevice, 'update', async () => [2]);
  const count = await deviceService.deactivateByPushToken('bad-token', 'invalid_token');
  assert.equal(count, 2);
});

test('007-user-devices migration version and indexes', async () => {
  assert.equal(devicesVersion, '007-user-devices');

  const added = [];
  const indexes = { user_devices: [] };
  const model = {
    sync: async () => {},
    getTableName: () => 'user_devices',
  };
  const queryInterface = {
    showIndex: async (table) => indexes[table] || [],
    addIndex: async (table, fields, opts) => {
      added.push({ name: opts.name, fields, unique: !!opts.unique });
      indexes[table].push({ name: opts.name, unique: !!opts.unique });
    },
    showAllTables: async () => ['user_devices'],
    dropTable: async () => {},
    removeIndex: async (table, name) => {
      indexes[table] = (indexes[table] || []).filter((i) => i.name !== name);
    },
  };

  await upDevices({ model, queryInterface });
  assert.equal(added.length, 3);
  assert.ok(added.find((a) => a.name === 'uq_user_devices_user_device' && a.unique));
  assert.ok(added.find((a) => a.name === 'ix_user_devices_user_active'));
  assert.ok(added.find((a) => a.name === 'ix_user_devices_push_token'));

  await downDevices({ model, queryInterface });
  await upDevices({ model, queryInterface });
  assert.equal(added.length, 6, 'UP after DOWN recreates indexes');
});
