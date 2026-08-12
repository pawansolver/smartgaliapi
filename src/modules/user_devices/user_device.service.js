import { Op } from 'sequelize';
import UserDevice from './user_device.model.js';

const serializeDevice = (row, { includeToken = false } = {}) => {
  const base = {
    id: Number(row.id),
    deviceId: row.device_id,
    platform: row.platform,
    appVersion: row.app_version ?? null,
    deviceModel: row.device_model ?? null,
    isActive: !!row.is_active,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeToken && row.push_token) {
    // Hint only — never return full token to clients after registration
    const t = row.push_token;
    base.pushTokenHint = t.length > 8 ? `${t.slice(0, 4)}…${t.slice(-4)}` : '***';
  }
  return base;
};

/**
 * Idempotent register / upsert by (user_id, device_id).
 * Rotates push_token on the same device row.
 */
export const registerDevice = async ({
  userId,
  deviceId,
  platform,
  pushToken,
  appVersion = null,
  deviceModel = null,
}) => {
  const now = new Date();
  const existing = await UserDevice.findOne({
    where: { user_id: userId, device_id: deviceId },
  });

  if (existing) {
    existing.platform = platform;
    existing.push_token = pushToken;
    existing.app_version = appVersion;
    existing.device_model = deviceModel;
    existing.is_active = true;
    existing.deactivated_reason = null;
    existing.last_seen_at = now;
    await existing.save();
    return { device: serializeDevice(existing, { includeToken: true }), created: false };
  }

  // If this token was previously on another device for same user, deactivate old row
  await UserDevice.update(
    { is_active: false, deactivated_reason: 'token_moved' },
    {
      where: {
        user_id: userId,
        push_token: pushToken,
        device_id: { [Op.ne]: deviceId },
        is_active: true,
      },
    },
  );

  const created = await UserDevice.create({
    user_id: userId,
    device_id: deviceId,
    platform,
    push_token: pushToken,
    app_version: appVersion,
    device_model: deviceModel,
    is_active: true,
    last_seen_at: now,
  });

  return { device: serializeDevice(created, { includeToken: true }), created: true };
};

export const updateDeviceToken = async ({
  userId,
  deviceId,
  pushToken,
  appVersion = null,
  deviceModel = null,
  platform = null,
}) => {
  const device = await UserDevice.findOne({
    where: { user_id: userId, device_id: deviceId },
  });
  if (!device) return { error: 'Device not found', status: 404 };

  device.push_token = pushToken;
  if (platform) device.platform = platform;
  if (appVersion !== null) device.app_version = appVersion;
  if (deviceModel !== null) device.device_model = deviceModel;
  device.is_active = true;
  device.deactivated_reason = null;
  device.last_seen_at = new Date();
  await device.save();

  return { device: serializeDevice(device, { includeToken: true }) };
};

export const getUserDevices = async (userId) => {
  const rows = await UserDevice.findAll({
    where: { user_id: userId },
    order: [['updated_at', 'DESC']],
  });
  return rows.map((r) => serializeDevice(r));
};

export const getActiveUserDevices = async (userId) => {
  return UserDevice.findAll({
    where: { user_id: userId, is_active: true },
    attributes: ['id', 'user_id', 'device_id', 'platform', 'push_token', 'is_active'],
  });
};

export const deactivateDevice = async ({ userId, deviceId, reason = 'user_deactivated' }) => {
  const device = await UserDevice.findOne({
    where: { user_id: userId, device_id: deviceId },
  });
  if (!device) return { error: 'Device not found', status: 404 };

  device.is_active = false;
  device.deactivated_reason = reason;
  await device.save();
  return { device: serializeDevice(device) };
};

export const removeDevice = async ({ userId, deviceId }) => {
  const deleted = await UserDevice.destroy({
    where: { user_id: userId, device_id: deviceId },
  });
  if (!deleted) return { error: 'Device not found', status: 404 };
  return { ok: true };
};

/**
 * Deactivate all rows with this FCM token (invalid/expired token cleanup).
 */
export const deactivateByPushToken = async (pushToken, reason = 'invalid_token') => {
  if (!pushToken) return 0;
  const [count] = await UserDevice.update(
    { is_active: false, deactivated_reason: String(reason).slice(0, 120) },
    { where: { push_token: pushToken, is_active: true } },
  );
  return count;
};

export default {
  registerDevice,
  updateDeviceToken,
  getUserDevices,
  getActiveUserDevices,
  deactivateDevice,
  removeDevice,
  deactivateByPushToken,
};
