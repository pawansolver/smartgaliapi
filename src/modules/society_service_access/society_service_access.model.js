import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const SOCIETY_SERVICE_ACCESS_STATUS = Object.freeze({
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED',
});

class SocietyServiceAccess extends Model {}

SocietyServiceAccess.init(
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    provider_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'service_provider_profiles',
        key: 'id',
      },
    },
    service_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'service_listings',
        key: 'id',
      },
    },
    society_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'society_profiles',
        key: 'id',
      },
    },
    requested_by: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'users',
        key: 'userId',
      },
    },
    requested_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    reviewed_by: {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: 'users',
        key: 'userId',
      },
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'REVOKED'),
      allowNull: false,
      defaultValue: 'REQUESTED',
    },
    rejection_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    suspension_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'SocietyServiceAccess',
    tableName: 'society_service_accesses',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['provider_id', 'service_id', 'society_id'],
        name: 'unique_provider_service_society',
      },
      {
        fields: ['society_id', 'status'],
        name: 'idx_society_access_status',
      },
      {
        fields: ['service_id', 'status'],
        name: 'idx_service_access_status',
      },
      {
        fields: ['provider_id', 'status'],
        name: 'idx_provider_access_status',
      },
    ],
  }
);

// Define associations
SocietyServiceAccess.belongsTo(ServiceProviderProfile, { foreignKey: 'provider_id', as: 'provider' });
SocietyServiceAccess.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyServiceAccess.belongsTo(User, { foreignKey: 'requested_by', as: 'requester' });
SocietyServiceAccess.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });

export default SocietyServiceAccess;
