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
  business_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  provider_type: {
    type: DataTypes.STRING(100),
    defaultValue: 'Independent Professional',
    allowNull: true,
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
  verification_status: {
    type: DataTypes.STRING(50),
    defaultValue: 'underReview',
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0.00,
  },
  review_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  completed_jobs_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  is_online: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  service_area: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('service_area');
      if (!raw) return null;
      try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (_) {
        return null;
      }
    },
    set(val) {
      this.setDataValue('service_area', val && typeof val === 'object' ? JSON.stringify(val) : val);
    }
  },
  availability: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('availability');
      if (!raw) return null;
      try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (_) {
        return null;
      }
    },
    set(val) {
      this.setDataValue('availability', val && typeof val === 'object' ? JSON.stringify(val) : val);
    }
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
