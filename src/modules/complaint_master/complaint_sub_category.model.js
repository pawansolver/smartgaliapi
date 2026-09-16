import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ComplaintCategory from './complaint_category.model.js';

const ComplaintSubCategory = sequelize.define('ComplaintSubCategory', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  category_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: ComplaintCategory,
      key: 'id',
    },
    onDelete: 'RESTRICT',
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  display_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'complaint_sub_categories',
  indexes: [
    { fields: ['category_id'] },
    { fields: ['category_id', 'slug'], unique: true },
    { fields: ['is_active', 'display_order'] },
  ],
});

ComplaintSubCategory.belongsTo(ComplaintCategory, { foreignKey: 'category_id', as: 'category' });
ComplaintCategory.hasMany(ComplaintSubCategory, { foreignKey: 'category_id', as: 'subCategories' });

export default ComplaintSubCategory;
