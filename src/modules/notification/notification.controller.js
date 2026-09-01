import { successResponse, errorResponse } from '../../utils/response.js';
import * as notificationService from './notification.service.js';

// ── CREATE ────────────────────────────────────────────────────────────────────

export const createNotification = async (req, res, next) => {
  try {
    const notification = await notificationService.createNotification(req.body);
    return successResponse(res, 201, 'Notification created successfully', notification);
  } catch (error) {
    next(error);
  }
};

// ── PER-USER real-time endpoints ──────────────────────────────────────────────

export const getMyNotifications = async (req, res, next) => {
  try {
    const { page, limit, unreadOnly, types } = req.query;

    // Support ?types=alert,system,reminder from the mobile tab filter
    const typeFilter = types
      ? types.split(',').map((t) => t.trim()).filter(Boolean)
      : null;

    const result = await notificationService.getUserNotifications(req.user.id, {
      page,
      limit,
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
      types: typeFilter,
    });
    return successResponse(res, 200, 'Notifications fetched successfully', result);
  } catch (error) {
    next(error);
  }
};

export const getMyUnreadCount = async (req, res, next) => {
  try {
    const unreadCount = await notificationService.getUnreadCount(req.user.id);
    return successResponse(res, 200, 'Unread count fetched successfully', { unreadCount });
  } catch (error) {
    next(error);
  }
};

export const markNotificationRead = async (req, res, next) => {
  try {
    const updated = await notificationService.markAsRead(req.user.id, req.params.id);
    if (!updated) {
      return errorResponse(res, 404, 'Notification not found');
    }
    return successResponse(res, 200, 'Notification marked as read', updated);
  } catch (error) {
    next(error);
  }
};

export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const updated = await notificationService.markAllAsRead(req.user.id);
    return successResponse(res, 200, 'All notifications marked as read', { updated });
  } catch (error) {
    next(error);
  }
};

// ── ADMIN: list all ────────────────────────────────────────────────────────────

export const getAllNotifications = async (req, res, next) => {
  try {
    const notifications = await notificationService.getAllNotifications();
    return successResponse(res, 200, 'Notifications fetched successfully', notifications);
  } catch (error) {
    next(error);
  }
};

export const getNotificationById = async (req, res, next) => {
  try {
    const notification = await notificationService.getNotificationById(req.params.id);
    if (!notification) {
      return errorResponse(res, 404, 'Notification not found');
    }
    return successResponse(res, 200, 'Notification fetched successfully', notification);
  } catch (error) {
    next(error);
  }
};

export const updateNotification = async (req, res, next) => {
  try {
    const notification = await notificationService.updateNotification(req.params.id, req.body);
    if (!notification) {
      return errorResponse(res, 404, 'Notification not found');
    }
    return successResponse(res, 200, 'Notification updated successfully', notification);
  } catch (error) {
    next(error);
  }
};

// ── DELETE (owner-only) ───────────────────────────────────────────────────────

/**
 * Soft-delete a single notification.
 * Ownership enforced: only the notification owner (user_id == req.user.id)
 * can delete their own notification. Returns 404 if not found OR not owned.
 */
export const deleteNotification = async (req, res, next) => {
  try {
    const { deletedRemarks } = req.body;
    const notification = await notificationService.softDeleteNotification(
      req.params.id,
      req.user.id,      // ownership: only owner can delete
      deletedRemarks,
      req.user.id,      // updated_by = caller
      true,             // ownerOnly = true
    );
    if (!notification) {
      return errorResponse(res, 404, 'Notification not found or not authorized');
    }
    return successResponse(res, 200, 'Notification deleted successfully', null);
  } catch (error) {
    next(error);
  }
};

/**
 * Bulk soft-delete notifications by IDs.
 * Ownership enforced: only deletes notifications that belong to req.user.id.
 * Returns { count } — number of records actually deleted.
 */
export const bulkDeleteNotifications = async (req, res, next) => {
  try {
    const { ids, deletedRemarks } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return errorResponse(res, 400, 'Please provide a non-empty array of ids');
    }
    if (ids.length > 200) {
      return errorResponse(res, 400, 'Cannot delete more than 200 notifications at once');
    }
    const result = await notificationService.bulkSoftDeleteNotifications(
      ids,
      req.user.id,      // ownership: filter to caller's notifications only
      deletedRemarks,
      req.user.id,
    );
    return successResponse(res, 200, 'Notifications deleted successfully', result);
  } catch (error) {
    next(error);
  }
};

// ── BROADCAST ─────────────────────────────────────────────────────────────────

export const sendBroadcast = async (req, res, next) => {
  try {
    const { title, message, created_by } = req.body;
    if (!title || !message) {
      return errorResponse(res, 400, 'Title and message are required for broadcast');
    }
    const count = await notificationService.sendBroadcastNotification(title, message, created_by);
    return successResponse(res, 200, `Broadcast sent to ${count} users successfully`, { count });
  } catch (error) {
    next(error);
  }
};

// ── EMAIL ─────────────────────────────────────────────────────────────────────

export const sendEmail = async (req, res, next) => {
  try {
    const { user_id, subject, body, created_by } = req.body;
    if (!user_id || !subject || !body) {
      return errorResponse(res, 400, 'User ID, subject, and body are required to send an email');
    }
    const emailData = {
      user_id,
      subject,
      body,
      status: 'sent',
      created_by: created_by || req.user.id,
    };
    const email = await notificationService.createEmailNotification(emailData);
    return successResponse(res, 201, 'Email sent and logged successfully', email);
  } catch (error) {
    next(error);
  }
};

export const getAllEmails = async (req, res, next) => {
  try {
    const emails = await notificationService.getAllEmailNotifications();
    return successResponse(res, 200, 'Email logs fetched successfully', emails);
  } catch (error) {
    next(error);
  }
};
