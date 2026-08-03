import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const PendingSignup = sequelize.define('PendingSignup', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: { type: DataTypes.STRING(120), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false },
  mobile: { type: DataTypes.STRING(20), allowNull: false },
  email_verified_at: { type: DataTypes.DATE, allowNull: true },
  session_jti_hash: { type: DataTypes.STRING(64), allowNull: true },
  session_expires_at: { type: DataTypes.DATE, allowNull: true },
  consumed_at: { type: DataTypes.DATE, allowNull: true },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'pending_signups',
  timestamps: false,
  indexes: [
    { fields: ['email'] },
    { fields: ['mobile'] },
    { fields: ['expires_at'] },
  ],
});

export default PendingSignup;
