import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ServiceCategory from './service_category.model.js';

const ServiceSubcategory = sequelize.define('ServiceSubcategory', {
  service_subcategory_id: {
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
  service_subcategory_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  service_subcategory_slug: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  service_subcategory_image: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'service_subcategories',
});

// Relationships
ServiceCategory.hasMany(ServiceSubcategory, {
  foreignKey: 'service_category_id',
  as: 'subcategories',
});

ServiceSubcategory.belongsTo(ServiceCategory, {
  foreignKey: 'service_category_id',
  as: 'category',
});

export default ServiceSubcategory;
