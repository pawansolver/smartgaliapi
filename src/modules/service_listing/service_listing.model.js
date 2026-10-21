import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import ServiceCategory from '../service_category/service_category.model.js';
import ServiceSubcategory from '../service_category/service_subcategory.model.js';
import {
  ServicePricingModel,
  ServicePricingUnit,
  ServiceDurationOption,
  ServiceBufferOption,
  ServiceInspectionFeeType,
  ServiceInspectionAdjustment,
  ServiceMaterialPolicy,
  ServiceChargeType,
  ServiceWarrantyOption,
  ServiceExecutionMethod,
  ServiceAreaType,
  ServiceRadiusOption,
  ServiceSlotDuration,
  ServiceBookingCapacity,
  ServicePackage,
  ServiceAddon,
} from '../service_config/service_config.models.js';
import ServiceCoverageArea from './service_coverage_area.model.js';

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

  // Coverage Scope: PUBLIC, SOCIETY, SOCIETY_AND_PUBLIC
  coverage_scope: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'PUBLIC',
  },

  // Master References
  pricing_model_id: { type: DataTypes.BIGINT, allowNull: true },
  pricing_unit_id: { type: DataTypes.BIGINT, allowNull: true },
  duration_option_id: { type: DataTypes.BIGINT, allowNull: true },
  min_duration_id: { type: DataTypes.BIGINT, allowNull: true },
  buffer_option_id: { type: DataTypes.BIGINT, allowNull: true },
  inspection_fee_type_id: { type: DataTypes.BIGINT, allowNull: true },
  inspection_adjustment_id: { type: DataTypes.BIGINT, allowNull: true },
  inspection_fee: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  hourly_rate: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  material_policy_id: { type: DataTypes.BIGINT, allowNull: true },
  charge_type_id: { type: DataTypes.BIGINT, allowNull: true },
  warranty_option_id: { type: DataTypes.BIGINT, allowNull: true },
  execution_method_id: { type: DataTypes.BIGINT, allowNull: true },
  service_area_type_id: { type: DataTypes.BIGINT, allowNull: true },
  radius_option_id: { type: DataTypes.BIGINT, allowNull: true },
  slot_duration_id: { type: DataTypes.BIGINT, allowNull: true },
  booking_capacity_id: { type: DataTypes.BIGINT, allowNull: true },

  ...commonFields
}, {
  timestamps: false,
  tableName: 'service_listings',
});

// Relationships
ServiceListing.belongsTo(ServiceProviderProfile, { foreignKey: 'provider_id', as: 'provider' });
ServiceListing.belongsTo(ServiceCategory, { foreignKey: 'category_id', as: 'category' });
ServiceListing.belongsTo(ServiceSubcategory, { foreignKey: 'service_subcategory_id', as: 'subcategory' });

// Master Relationships
ServiceListing.belongsTo(ServicePricingModel, { foreignKey: 'pricing_model_id', as: 'pricing_model' });
ServiceListing.belongsTo(ServicePricingUnit, { foreignKey: 'pricing_unit_id', as: 'pricing_unit' });
ServiceListing.belongsTo(ServiceDurationOption, { foreignKey: 'duration_option_id', as: 'duration_option' });
ServiceListing.belongsTo(ServiceDurationOption, { foreignKey: 'min_duration_id', as: 'min_duration_option' });
ServiceListing.belongsTo(ServiceBufferOption, { foreignKey: 'buffer_option_id', as: 'buffer_option' });
ServiceListing.belongsTo(ServiceInspectionFeeType, { foreignKey: 'inspection_fee_type_id', as: 'inspection_fee_type' });
ServiceListing.belongsTo(ServiceInspectionAdjustment, { foreignKey: 'inspection_adjustment_id', as: 'inspection_adjustment' });
ServiceListing.belongsTo(ServiceMaterialPolicy, { foreignKey: 'material_policy_id', as: 'material_policy' });
ServiceListing.belongsTo(ServiceChargeType, { foreignKey: 'charge_type_id', as: 'charge_type' });
ServiceListing.belongsTo(ServiceWarrantyOption, { foreignKey: 'warranty_option_id', as: 'warranty_option' });
ServiceListing.belongsTo(ServiceExecutionMethod, { foreignKey: 'execution_method_id', as: 'execution_method' });
ServiceListing.belongsTo(ServiceAreaType, { foreignKey: 'service_area_type_id', as: 'service_area_type' });
ServiceListing.belongsTo(ServiceRadiusOption, { foreignKey: 'radius_option_id', as: 'radius_option' });
ServiceListing.belongsTo(ServiceSlotDuration, { foreignKey: 'slot_duration_id', as: 'slot_duration' });
ServiceListing.belongsTo(ServiceBookingCapacity, { foreignKey: 'booking_capacity_id', as: 'booking_capacity' });

// Child Collections
ServiceListing.hasMany(ServicePackage, { foreignKey: 'service_id', as: 'packages' });
ServiceListing.hasMany(ServiceAddon, { foreignKey: 'service_id', as: 'addons' });
ServiceListing.hasMany(ServiceCoverageArea, { foreignKey: 'service_id', as: 'coverage_areas' });
ServiceCoverageArea.belongsTo(ServiceListing, { foreignKey: 'service_id', as: 'listing' });

export default ServiceListing;
