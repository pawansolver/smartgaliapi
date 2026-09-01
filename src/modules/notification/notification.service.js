import Notification from './notification.model.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';
import NotificationPreference from '../profile/notification_preference.model.js';
// ── FCM push (non-blocking helper used by emitNotification) ──────────────────
import { sendToUser } from '../../infrastructure/notifications/push.service.js';
import { logger } from '../../utils/logger.js';

/**
 * Shape a raw Notification row into the stable contract the mobile client
 * consumes. Keeps API responses decoupled from internal column names.
 */
const serializeNotification = (n) => ({
  id: Number(n.id),
  title: n.title,
  message: n.message,
  type: n.type,
  data: n.data ?? null,
  isRead: !!n.is_read,
  createdAt: n.created_at,
});

const preferenceColumns = new Set([
  'society_announcements',
  'complaint_updates',
  'visitor_alerts',
  'event_reminders',
  'community_chat',
  'promotional_offers',
  'booking_requests',
  'customer_messages',
  'weekly_digest',
  'invoices_receipts',
]);

const preferenceForNotification = (notificationData) => {
  const explicit = notificationData.data?.preferenceKey;
  if (preferenceColumns.has(explicit)) return explicit;
  if (notificationData.type === 'message') return 'community_chat';
  if (notificationData.type === 'reminder') return 'event_reminders';
  if (notificationData.type === 'alert') return 'society_announcements';
  return null;
};

export const createNotification = async (notificationData) => {
  const preference = preferenceForNotification(notificationData);
  if (preference && notificationData.user_id) {
    const row = await NotificationPreference.findOne({
      where: { user_id: notificationData.user_id, is_deleted: false },
      attributes: [preference],
    });
    if (row && row[preference] === false) return null;
  }
  return await Notification.create(notificationData);
};

// ── Per-user, real-time notification feed ─────────────────────────────────────

/**
 * Paginated notification feed scoped strictly to the authenticated user.
 * Supports optional category filter by type[] array.
 */
export const getUserNotifications = async (userId, {
  page = 1,
  limit = 20,
  unreadOnly = false,
  types = null,       // NEW: category filter e.g. ['alert','system','reminder']
} = {}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const where = { user_id: userId, is_deleted: false };
  if (unreadOnly) where.is_read = false;
  if (Array.isArray(types) && types.length > 0) {
    where.type = types;
  }

  const { rows, count } = await Notification.findAndCountAll({
    where,
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: safeLimit,
    offset,
  });

  const unreadCount = await Notification.count({
    where: { user_id: userId, is_deleted: false, is_read: false },
  });

  return {
    items: rows.map(serializeNotification),
    unreadCount,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: count,
      totalPages: Math.ceil(count / safeLimit) || 1,
    },
  };
};

/** Lightweight unread counter used by the notification bell badge poller. */
export const getUnreadCount = async (userId) => {
  return await Notification.count({
    where: { user_id: userId, is_deleted: false, is_read: false },
  });
};

/** Mark a single notification read, only if it belongs to the caller. */
export const markAsRead = async (userId, id) => {
  const notification = await Notification.findOne({
    where: { id, user_id: userId, is_deleted: false },
  });
  if (!notification) return null;
  if (!notification.is_read) {
    await notification.update({ is_read: true, updated_by: userId, updatedAt: new Date() });
  }
  return serializeNotification(notification);
};

/** Mark every unread notification for the caller as read in one write. */
export const markAllAsRead = async (userId) => {
  const [affected] = await Notification.update(
    { is_read: true, updated_by: userId, updatedAt: new Date() },
    { where: { user_id: userId, is_deleted: false, is_read: false } }
  );
  return affected;
};

// ── Event-driven notification emitter ─────────────────────────────────────────

/** Resolve a friendly display name for a user, with safe fallbacks. */
export const resolveDisplayName = async (userId) => {
  try {
    const profile = await UserProfile.findOne({
      where: { user_id: userId },
      attributes: ['fullName'],
    });
    if (profile?.fullName) return profile.fullName;
    const user = await User.findByPk(userId, { attributes: ['userName'] });
    return user?.userName || 'Someone';
  } catch (_) {
    return 'Someone';
  }
};

/**
 * Enterprise-grade unified notification emitter.
 *
 * Guarantees:
 *  1. Never notifies a user about their OWN action (self-suppress).
 *  2. Respects per-user notification preferences before DB insert.
 *  3. Fires FCM push AFTER DB insert (non-blocking, fire-and-forget).
 *  4. Errors are swallowed — notification failure NEVER breaks the
 *     primary action (like/comment/follow) that triggered it.
 *  5. Resolves actor's display name automatically when actorId is set.
 *  6. Injects deep-link 	arget into data payload for mobile routing.
 *
 * @param {object} opts
 * @param {number}  opts.recipientId     — user who receives the notification
 * @param {number}  [opts.actorId]       — user who triggered the event
 * @param {string}  opts.type            — Notification.type enum
 * @param {string}  [opts.title]         — notification title (overrides auto)
 * @param {string}  [opts.message]       — notification body (overrides auto)
 * @param {object}  [opts.data]          — extra JSON payload (deep-link data)
 * @param {string}  [opts.preferenceKey] — maps to NotificationPreference column
 * @param {boolean} [opts.sendPush=true] — whether to also fire FCM push
 */
export const emitNotification = async ({
  recipientId,
  actorId = null,
  type = 'info',
  title,
  message,
  data = null,
  preferenceKey = null,
  sendPush = true,
}) => {
  try {
    if (!recipientId) return null;
    // Self-suppress: actor and recipient are the same person
    if (actorId != null && String(recipientId) === String(actorId)) return null;

    // Resolve actor display name if not provided in title/message
    let actorName = null;
    if (actorId) {
      actorName = await resolveDisplayName(actorId);
    }

    // Build the notification record
    const notification = await createNotification({
      user_id: recipientId,
      title,
      message,
      type,
      is_read: false,
      created_by: actorId,
      data: {
        ...(data || {}),
        actorId,
        actorName,
        ...(preferenceKey ? { preferenceKey } : {}),
      },
    });

    // FCM push: fire-and-forget after DB write succeeds
    if (sendPush && notification) {
      sendToUser({
        userId: recipientId,
        title,
        body: message,
        data: {
          type,
          ...(data || {}),
          actorId: String(actorId ?? ''),
        },
      }).catch((err) => {
        logger.warn('emitNotification', 'fcm_push_failed', {
          recipientId,
          type,
          error: err?.message || err,
        });
      });
    }

    return notification;
  } catch (err) {
    logger.error('emitNotification', 'failed', { recipientId, type, error: err?.message || err });
    return null;
  }
};

export const getAllNotifications = async () => {
  return await Notification.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] }
    ]
  });
};

export const getNotificationById = async (id) => {
  return await Notification.findOne({
    where: { id, is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'profile_image'] }
    ]
  });
};

export const updateNotification = async (id, updateData) => {
  const notification = await Notification.findOne({ where: { id, is_deleted: false } });
  if (!notification) return null;
  return await notification.update({ ...updateData, updatedAt: new Date() });
};

/**
 * Soft-delete a notification. Ownership enforced: only the notification's
 * owner (user_id) may delete it. Admins bypass via ownerOnly=false.
 */
export const softDeleteNotification = async (id, userId, deletedRemarks, updated_by, ownerOnly = true) => {
  const where = { id, is_deleted: false };
  if (ownerOnly) where.user_id = userId; // ownership guard
  const notification = await Notification.findOne({ where });
  if (!notification) return null;
  return await notification.update({
    is_deleted: true,
    deletedRemarks,
    updated_by,
    updatedAt: new Date(),
  });
};

/**
 * Bulk soft-delete. Ownership enforced: only deletes notifications belonging
 * to the caller (userId). Returns { count } so frontend can confirm.
 */
export const bulkSoftDeleteNotifications = async (ids, userId, deletedRemarks, updated_by) => {
  const [affected] = await Notification.update(
    { is_deleted: true, deletedRemarks, updated_by, updatedAt: new Date() },
    { where: { id: ids, user_id: userId, is_deleted: false } } // ownership guard
  );
  return { count: affected };
};

// ── Broadcast ─────────────────────────────────────────────────────────────────

export const sendBroadcastNotification = async (title, message, created_by) => {
  const users = await User.findAll({ where: { is_active: 1, is_deleted: 0 }, attributes: ['userId'] });
  if (!users || users.length === 0) return 0;

  const disabledRows = await NotificationPreference.findAll({
    where: { society_announcements: false, is_deleted: false },
    attributes: ['user_id'],
  });
  const disabled = new Set(disabledRows.map((row) => String(row.user_id)));
  const notifications = users
    .filter((user) => !disabled.has(String(user.userId)))
    .map(user => ({
      user_id: user.userId,
      title,
      message,
      type: 'alert',
      is_read: false,
      created_by: created_by || 1,
    }));

  if (notifications.length === 0) return 0;
  await Notification.bulkCreate(notifications);

  // FCM broadcast — fire-and-forget per user (non-blocking)
  for (const n of notifications) {
    sendToUser({ userId: n.user_id, title, body: message, data: { type: 'alert' } })
      .catch((err) => logger.warn('Broadcast', 'fcm_failed', { userId: n.user_id, error: err?.message }));
  }

  return notifications.length;
};

// ── Email ─────────────────────────────────────────────────────────────────────

// Import EmailNotification model here to avoid circular dependency early load issues
import EmailNotification from './email_notification.model.js';

export const createEmailNotification = async (emailData) => {
  const preference = preferenceColumns.has(emailData.preferenceKey)
    ? emailData.preferenceKey
    : null;
  if (preference && emailData.user_id) {
    const row = await NotificationPreference.findOne({
      where: { user_id: emailData.user_id, is_deleted: false },
      attributes: [preference],
    });
    if (row && row[preference] === false) return null;
  }
  const { preferenceKey, ...persistedData } = emailData;
  return await EmailNotification.create(persistedData);
};

export const getAllEmailNotifications = async () => {
  return await EmailNotification.findAll({
    where: { is_deleted: false },
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'profile_image'] }
    ]
  });
};
