import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';

const RefreshToken = sequelize.define('RefreshToken', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: User, key: 'userId' },
  },
  token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  family_id: { type: DataTypes.UUID, allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  revoked_at: { type: DataTypes.DATE, allowNull: true },
  replaced_by_id: { type: DataTypes.UUID, allowNull: true },
  created_by_ip: { type: DataTypes.STRING(45), allowNull: true },
  user_agent: { type: DataTypes.STRING(255), allowNull: true },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'refresh_tokens',
  timestamps: false,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['family_id'] },
    { fields: ['expires_at'] },
  ],
});

export default RefreshToken;
