import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ServiceProviderProfile from './service_provider_profile.model.js';
import User from '../user/user.model.js';
import KycDocumentType from '../service_category/kyc_document_type.model.js';

export const PROVIDER_DOCUMENT_TYPES = Object.freeze({
  IDENTITY_PROOF: 'identity_proof',
  TRADE_LICENSE: 'trade_license',
  SKILL_CERTIFICATE: 'skill_certificate',
  ADDRESS_PROOF: 'address_proof',
  EXPERIENCE_LETTER: 'experience_letter',
  OTHER: 'other',
});

export const PROVIDER_DOCUMENT_STATUSES = Object.freeze({
  UNDER_REVIEW: 'under_review',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
});

const ProviderDocument = sequelize.define('ProviderDocument', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  provider_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: ServiceProviderProfile,
      key: 'id',
    },
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  document_type: {
    type: DataTypes.STRING(50),
    defaultValue: 'other',
    allowNull: false,
  },
  document_type_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: KycDocumentType,
      key: 'id',
    },
  },
  document_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  expiry_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  issue_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  title: {
    type: DataTypes.STRING(255),
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
    defaultValue: 'under_review',
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
  tableName: 'provider_documents',
});

// Setup relationships
ProviderDocument.belongsTo(ServiceProviderProfile, { foreignKey: 'provider_id', as: 'provider' });
ServiceProviderProfile.hasMany(ProviderDocument, { foreignKey: 'provider_id', as: 'documents' });

ProviderDocument.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
ProviderDocument.belongsTo(User, { foreignKey: 'verified_by', as: 'verifier' });
ProviderDocument.belongsTo(KycDocumentType, { foreignKey: 'document_type_id', as: 'masterDocumentType' });

export default ProviderDocument;
