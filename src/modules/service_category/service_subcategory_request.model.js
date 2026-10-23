import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import User from '../user/user.model.js';
import ServiceCategory from './service_category.model.js';
import ServiceSubcategory from './service_subcategory.model.js';

export const SUBCATEGORY_REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const ServiceSubcategoryRequest = sequelize.define('ServiceSubcategoryRequest', {
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
  service_category_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: ServiceCategory,
      key: 'serviceCategoryId',
    },
  },
  suggested_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'pending',
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
  review_note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  resolved_subcategory_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ServiceSubcategory,
      key: 'service_subcategory_id',
    },
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  updated_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  deletedRemarks: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'service_subcategory_requests',
});

ServiceSubcategoryRequest.belongsTo(ServiceProviderProfile, { foreignKey: 'provider_id', as: 'provider' });
ServiceSubcategoryRequest.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
ServiceSubcategoryRequest.belongsTo(ServiceCategory, { foreignKey: 'service_category_id', as: 'category' });
ServiceSubcategoryRequest.belongsTo(ServiceSubcategory, { foreignKey: 'resolved_subcategory_id', as: 'resolvedSubcategory' });
ServiceSubcategoryRequest.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });

export default ServiceSubcategoryRequest;
