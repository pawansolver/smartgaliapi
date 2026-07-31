import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

const ServiceCategory = sequelize.define('ServiceCategory', {
  serviceCategoryId: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  serviceCategoryName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  serviceCategoryImage: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'service_categories',
});

export default ServiceCategory;
