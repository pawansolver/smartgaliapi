import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

/**
 * UserProfile Model — Enterprise Level
 *
 * Added for Socket.IO Online Presence tracking (green dot in UI):
 *  - is_online   → true when user's socket is connected
 *  - last_seen   → timestamp set on socket disconnect
 */
const UserProfile = sequelize.define('UserProfile', {
  userProfileId: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: User, key: 'userId' },
  },
  fullName: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  // ── Profile enrichment fields (Instagram/Twitter-style header) ──
  bio: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  // Human-readable current location label (e.g. "Boring Road, Patna")
  locationName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  isProfileComplete: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  // ── Online Presence (Socket.IO driven — Green Dot in UI) ───────────────────
  is_online: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'True while user\'s Socket.IO connection is alive',
  },
  last_seen: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp of last socket disconnect; shown as "last seen X ago" in UI',
  },

  ...commonFields,
}, {
  timestamps: false,
  tableName: 'user_profiles',
});

// ── Associations ──────────────────────────────────────────────────────────────
UserProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasOne(UserProfile,    { foreignKey: 'user_id', as: 'profile' });

export default UserProfile;
