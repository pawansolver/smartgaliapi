import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import ServiceCategory from '../service_category/service_category.model.js';
import ServiceSubcategory from '../service_category/service_subcategory.model.js';

const ServiceListing = sequelize.define('ServiceListing', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  provider_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ServiceProviderProfile,
      key: 'id',
    }
  },
  category_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ServiceCategory,
      key: 'serviceCategoryId',
    }
  },
  service_subcategory_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ServiceSubcategory,
      key: 'service_subcategory_id',
    }
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  duration: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  is_available: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  moderation_status: {
    type: DataTypes.STRING(50),
    defaultValue: 'approved',
  },
  moderation_remarks: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  highlights: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('highlights');
      if (!raw) return [];
      try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (_) {
        return [];
      }
    },
    set(val) {
      this.setDataValue('highlights', val && typeof val === 'object' ? JSON.stringify(val) : val);
    }
  },
  safe_terms: {
    type: DataTypes.TEXT,
    allowNull: true,
    set(val) {
      if (Array.isArray(val)) {
        this.setDataValue('safe_terms', val.join('; '));
      } else if (val && typeof val === 'object') {
        this.setDataValue('safe_terms', JSON.stringify(val));
      } else {
        this.setDataValue('safe_terms', val);
      }
    }
  },
  images: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('images');
      if (!raw) return [];
      try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (_) {
        return [];
      }
    },
    set(val) {
      this.setDataValue('images', val && typeof val === 'object' ? JSON.stringify(val) : val);
    }
  },
  bookings_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0.00,
  },
  reviews_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'service_listings',
});

// Relationships
ServiceListing.belongsTo(ServiceProviderProfile, { foreignKey: 'provider_id', as: 'provider' });
ServiceListing.belongsTo(ServiceCategory, { foreignKey: 'category_id', as: 'category' });
ServiceListing.belongsTo(ServiceSubcategory, { foreignKey: 'service_subcategory_id', as: 'subcategory' });

export default ServiceListing;
