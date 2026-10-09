import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const RESIDENT_DOCUMENT_TYPES = Object.freeze({
  RENT_AGREEMENT: 'rent_agreement',
  POLICE_VERIFICATION: 'police_verification',
  TENANT_KYC: 'tenant_kyc',
  VEHICLE_RC: 'vehicle_rc',
  SALE_DEED: 'sale_deed',
  UTILITY_NOC: 'utility_noc',
  PET_REGISTRATION: 'pet_registration',
  OTHER: 'other',
});

export const RESIDENT_DOCUMENT_STATUSES = Object.freeze({
  PRIVATE: 'private',
  SHARED_FOR_VERIFICATION: 'shared_for_verification',
  UNDER_REVIEW: 'under_review',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
});

const ResidentDocument = sequelize.define('ResidentDocument', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyProfile,
      key: 'id',
    },
  },
  owner_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  flat_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  document_type: {
    type: DataTypes.STRING(50),
    defaultValue: 'other',
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  file_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  file_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  file_size: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'private',
    allowNull: false,
  },
  verified_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'resident_documents',
});

ResidentDocument.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
ResidentDocument.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
ResidentDocument.belongsTo(User, { foreignKey: 'verified_by', as: 'verifier' });

export default ResidentDocument;
