import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const DOCUMENT_CATEGORIES = Object.freeze({
  BYE_LAWS: 'bye_laws',
  FORMS: 'forms',
  NOC: 'noc',
  TEMPLATES: 'templates',
  FINANCE: 'finance',
  SECURITY: 'security',
  GENERAL: 'general',
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
  category: {
    type: DataTypes.STRING(50),
    defaultValue: 'general',
    allowNull: false,
  },
  uploaded_by: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'society_documents',
});

SocietyDocument.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyDocument.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });

export default SocietyDocument;
