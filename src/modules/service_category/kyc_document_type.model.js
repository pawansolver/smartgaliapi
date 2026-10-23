import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

const KycDocumentType = sequelize.define('KycDocumentType', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  allowed_mime_types: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  max_file_size_bytes: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 10485760, // 10MB
  },
  requires_expiry: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'kyc_document_types',
});

export default KycDocumentType;
