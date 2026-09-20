/**
 * SocietyWorkerAuthorization Model
 * Represents an authorized worker/vendor for a specific society.
 * ROLE != TRADE != SERVICE PROVIDER PROFILE != SOCIETY AUTHORIZATION
 */
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';

export const WORKER_AUTH_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
  PENDING: 'pending',
});

const SocietyWorkerAuthorization = sequelize.define('SocietyWorkerAuthorization', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: SocietyProfile, key: 'id' },
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: User, key: 'userId' },
  },
  service_provider_profile_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: ServiceProviderProfile, key: 'id' },
  },
  designation: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: 'Worker',
  },
  authorization_status: {
    type: DataTypes.ENUM('active', 'suspended', 'revoked', 'pending'),
    allowNull: false,
    defaultValue: 'active',
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: { type: DataTypes.BIGINT, allowNull: true },
  updated_by: { type: DataTypes.BIGINT, allowNull: true },
  is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
  remark: { type: DataTypes.TEXT, allowNull: true },
  deletedRemarks: { type: DataTypes.TEXT, allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'society_worker_authorizations',
  timestamps: false,
});

SocietyWorkerAuthorization.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyWorkerAuthorization.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
SocietyWorkerAuthorization.belongsTo(ServiceProviderProfile, { foreignKey: 'service_provider_profile_id', as: 'providerProfile' });

export default SocietyWorkerAuthorization;
