import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import ServiceCategory from '../service_category/service_category.model.js';

const ServiceProviderProfile = sequelize.define('ServiceProviderProfile', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  service_category_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ServiceCategory,
      key: 'serviceCategoryId',
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  experience: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  hourly_rate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'service_provider_profiles',
});

// Setup relationships
ServiceProviderProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
ServiceProviderProfile.belongsTo(ServiceCategory, { foreignKey: 'service_category_id', as: 'category' });

export default ServiceProviderProfile;
