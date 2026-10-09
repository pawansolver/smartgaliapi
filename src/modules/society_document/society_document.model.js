import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';
import SocietyDocumentVersion from './society_document_version.model.js';
import SocietyDocumentAcknowledgement from './society_document_acknowledgement.model.js';

export const DOCUMENT_CATEGORIES = Object.freeze({
  BYE_LAWS: 'bye_laws',
  POLICIES: 'policies',
  CIRCULAR: 'circular',
  NOTICES: 'notices',
  MEETING_DOCS: 'meeting_docs',
  AGM_MINUTES: 'agm_minutes',
  MAINTENANCE_POLICY: 'maintenance_policy',
  PARKING_POLICY: 'parking_policy',
  SECURITY_POLICY: 'security_policy',
  FACILITY_RULES: 'facility_rules',
  EMERGENCY: 'emergency',
  VENDOR_CONTRACT: 'vendor_contract',
  COMPLIANCE: 'compliance',
  FORMS: 'forms',
  NOC: 'noc',
  TEMPLATES: 'templates',
  FINANCE: 'finance',
  SECURITY: 'security',
  GENERAL: 'general',
  OTHER: 'other',
});

export const DOCUMENT_STATUSES = Object.freeze({
  DRAFT: 'draft',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
  EXPIRED: 'expired',
});

export const DOCUMENT_PRIORITIES = Object.freeze({
  NORMAL: 'normal',
  IMPORTANT: 'important',
  URGENT: 'urgent',
});

export const DOCUMENT_VISIBILITY = Object.freeze({
  ALL: 'all',
  RESIDENT: 'resident',
  COMMITTEE: 'committee',
  ADMIN: 'admin',
  SECURITY: 'security',
  MAINTENANCE: 'maintenance',
  SPECIFIC_ROLES: 'specific_roles',
});

const SocietyDocument = sequelize.define('SocietyDocument', {
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
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  document_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  version: {
    type: DataTypes.STRING(20),
    defaultValue: '1.0',
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
  is_official: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  flat_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  category: {
    type: DataTypes.STRING(50),
    defaultValue: 'general',
    allowNull: false,
  },
  priority: {
    type: DataTypes.STRING(20),
    defaultValue: 'normal',
    allowNull: false,
  },
  visibility: {
    type: DataTypes.STRING(50),
    defaultValue: 'all',
    allowNull: false,
  },
  allowed_roles: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'published',
    allowNull: false,
  },
  requires_approval: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  acknowledgement_required: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  parent_document_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  effective_from: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  expiry_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  uploaded_by: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  reviewed_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  reviewed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  approved_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  published_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  archived_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  scheduled_publish_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'society_documents',
});

SocietyDocument.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyDocument.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });
SocietyDocument.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });
SocietyDocument.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });
SocietyDocument.belongsTo(User, { foreignKey: 'published_by', as: 'publisher' });
SocietyDocument.hasMany(SocietyDocumentVersion, { foreignKey: 'document_id', as: 'versions' });
SocietyDocument.hasMany(SocietyDocumentAcknowledgement, { foreignKey: 'document_id', as: 'acknowledgements' });

export default SocietyDocument;
