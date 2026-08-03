import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import PendingSignup from './pending_signup.model.js';

const EmailOtp = sequelize.define('EmailOtp', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: User, key: 'userId' },
  },
  pending_signup_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: PendingSignup, key: 'id' },
  },
  email: { type: DataTypes.STRING(255), allowNull: false },
  purpose: { type: DataTypes.ENUM('signup', 'password_reset'), allowNull: false },
  otp_hash: { type: DataTypes.STRING(255), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  consumed_at: { type: DataTypes.DATE, allowNull: true },
  attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  session_jti_hash: { type: DataTypes.STRING(64), allowNull: true },
  session_expires_at: { type: DataTypes.DATE, allowNull: true },
  session_consumed_at: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'email_otps',
  timestamps: false,
  indexes: [
    { fields: ['email', 'purpose', 'created_at'] },
    { fields: ['user_id', 'purpose'] },
    { fields: ['pending_signup_id', 'purpose'] },
    { fields: ['expires_at'] },
  ],
});

export default EmailOtp;
