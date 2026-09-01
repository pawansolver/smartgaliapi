import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

/**
 * NotificationPreference — one row per user (1:1) capturing every toggle
 * on the "Notification Preferences" screen. Grouped into push / professional / email.
 */
const NotificationPreference = sequelize.define('NotificationPreference', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true,
    references: { model: User, key: 'userId' },
  },

  // ── Push notifications ──
  society_announcements: { type: DataTypes.BOOLEAN, defaultValue: true },
  complaint_updates: { type: DataTypes.BOOLEAN, defaultValue: true },
  visitor_alerts: { type: DataTypes.BOOLEAN, defaultValue: true },
  event_reminders: { type: DataTypes.BOOLEAN, defaultValue: true },
  community_chat: { type: DataTypes.BOOLEAN, defaultValue: true },
  promotional_offers: { type: DataTypes.BOOLEAN, defaultValue: false },

  // ── Professional & business alerts ──
  booking_requests: { type: DataTypes.BOOLEAN, defaultValue: true },
  customer_messages: { type: DataTypes.BOOLEAN, defaultValue: true },

  // ── Email notifications ──
  weekly_digest: { type: DataTypes.BOOLEAN, defaultValue: true },
  invoices_receipts: { type: DataTypes.BOOLEAN, defaultValue: true },

  ...commonFields,
}, {
  timestamps: false,
  tableName: 'notification_preferences',
});

NotificationPreference.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasOne(NotificationPreference, { foreignKey: 'user_id', as: 'notificationPreference' });

export default NotificationPreference;
