import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ServiceCategory from './service_category.model.js';
import KycDocumentType from './kyc_document_type.model.js';

const CategoryDocumentRequirement = sequelize.define('CategoryDocumentRequirement', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  service_category_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: ServiceCategory,
      key: 'serviceCategoryId',
    },
  },
  kyc_document_type_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: KycDocumentType,
      key: 'id',
    },
  },
  is_mandatory: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  applicable_provider_type: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'category_document_requirements',
});

CategoryDocumentRequirement.belongsTo(ServiceCategory, { foreignKey: 'service_category_id', as: 'category' });
ServiceCategory.hasMany(CategoryDocumentRequirement, { foreignKey: 'service_category_id', as: 'documentRequirements' });

CategoryDocumentRequirement.belongsTo(KycDocumentType, { foreignKey: 'kyc_document_type_id', as: 'documentType' });
KycDocumentType.hasMany(CategoryDocumentRequirement, { foreignKey: 'kyc_document_type_id', as: 'categoryRequirements' });

export default CategoryDocumentRequirement;
