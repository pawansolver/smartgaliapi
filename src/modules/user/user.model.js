import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

const User = sequelize.define('User', {
  userId: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },

  userName: {
    type: DataTypes.STRING,
    allowNull: true,  // nullable for OTP-only (phone) registrations
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  // ── Optional password (OTP-first users may set one later) ──
  // Stored as a bcrypt hash. Nullable because OTP login users never
  // need a password unless they explicitly set one via /profile/change-password.
  password: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },

  // ── OTP Login Fields ──────────────────────────────────────
  currentOtp: {
    type: DataTypes.STRING,
    allowNull: true,  // stores bcrypt-hashed OTP
  },
  otpExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  otpSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'otp_sent_at', // maps to 'otp_sent_at' column in DB
  },
  otpResendCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'otp_resend_count',
  },
  otpBlockedUntil: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'otp_blocked_until',
  },
  // ── Role shorthand for OTP-registered users ───────────────
  userRole: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'resident',
    field: 'user_role',  // maps to 'user_role' column in DB
  },

  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'pending'),
    defaultValue: 'active',
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'users',
});

// Setup relationships
// User relationships handled elsewhere if needed

export default User;
