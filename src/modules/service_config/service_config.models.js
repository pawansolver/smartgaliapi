import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

// 1. Pricing Model
export const ServicePricingModel = sequelize.define('ServicePricingModel', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_pricing_models', timestamps: false });

// 2. Pricing Unit
export const ServicePricingUnit = sequelize.define('ServicePricingUnit', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  pricing_model_code: { type: DataTypes.STRING(50), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_pricing_units', timestamps: false });

// 3. Duration Option
export const ServiceDurationOption = sequelize.define('ServiceDurationOption', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  label: { type: DataTypes.STRING(100), allowNull: false },
  minutes: { type: DataTypes.INTEGER, allowNull: false },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_duration_options', timestamps: false });

// 4. Buffer Option
export const ServiceBufferOption = sequelize.define('ServiceBufferOption', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  label: { type: DataTypes.STRING(100), allowNull: false },
  minutes: { type: DataTypes.INTEGER, allowNull: false },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_buffer_options', timestamps: false });

// 5. Inspection Fee Type
export const ServiceInspectionFeeType = sequelize.define('ServiceInspectionFeeType', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_inspection_fee_types', timestamps: false });

// 6. Inspection Adjustment
export const ServiceInspectionAdjustment = sequelize.define('ServiceInspectionAdjustment', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_inspection_adjustments', timestamps: false });

// 7. Package Level
export const ServicePackageLevel = sequelize.define('ServicePackageLevel', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_package_levels', timestamps: false });

// 8. Addon Type
export const ServiceAddonType = sequelize.define('ServiceAddonType', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_addon_types', timestamps: false });

// 9. Material Policy
export const ServiceMaterialPolicy = sequelize.define('ServiceMaterialPolicy', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_material_policies', timestamps: false });

// 10. Charge Type
export const ServiceChargeType = sequelize.define('ServiceChargeType', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_charge_types', timestamps: false });

// 11. Warranty Option
export const ServiceWarrantyOption = sequelize.define('ServiceWarrantyOption', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  duration_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_warranty_options', timestamps: false });

// 12. Execution Method
export const ServiceExecutionMethod = sequelize.define('ServiceExecutionMethod', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_execution_methods', timestamps: false });

// 13. Service Area Type
export const ServiceAreaType = sequelize.define('ServiceAreaType', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_area_types', timestamps: false });

// 14. Service Radius Option
export const ServiceRadiusOption = sequelize.define('ServiceRadiusOption', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  label: { type: DataTypes.STRING(100), allowNull: false },
  radius_km: { type: DataTypes.DECIMAL(6, 2), allowNull: false },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_radius_options', timestamps: false });

// 15. Slot Duration
export const ServiceSlotDuration = sequelize.define('ServiceSlotDuration', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  label: { type: DataTypes.STRING(100), allowNull: false },
  minutes: { type: DataTypes.INTEGER, allowNull: false },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_slot_durations', timestamps: false });

// 16. Booking Capacity
export const ServiceBookingCapacity = sequelize.define('ServiceBookingCapacity', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  label: { type: DataTypes.STRING(100), allowNull: false },
  capacity: { type: DataTypes.INTEGER, allowNull: false },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'service_booking_capacities', timestamps: false });

// Child Table 1: Service Package
export const ServicePackage = sequelize.define('ServicePackage', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  service_id: { type: DataTypes.BIGINT, allowNull: false },
  package_level_id: { type: DataTypes.BIGINT, allowNull: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
  duration_minutes: { type: DataTypes.INTEGER, allowNull: true },
  included_items: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('included_items');
      if (!raw) return [];
      try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return []; }
    },
    set(val) {
      this.setDataValue('included_items', val && typeof val === 'object' ? JSON.stringify(val) : val);
    }
  },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'service_packages', timestamps: false });

// Child Table 2: Service Addon
export const ServiceAddon = sequelize.define('ServiceAddon', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  service_id: { type: DataTypes.BIGINT, allowNull: false },
  addon_type_id: { type: DataTypes.BIGINT, allowNull: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
  is_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'service_addons', timestamps: false });

// Key Master Model Mapping
export const MASTER_MODELS_MAP = {
  'pricing-models': { model: ServicePricingModel, name: 'Pricing Model', hasLabel: false },
  'pricing-units': { model: ServicePricingUnit, name: 'Pricing Unit', hasLabel: false },
  'durations': { model: ServiceDurationOption, name: 'Duration Option', hasLabel: true },
  'buffer-options': { model: ServiceBufferOption, name: 'Buffer Option', hasLabel: true },
  'inspection-fee-types': { model: ServiceInspectionFeeType, name: 'Inspection Fee Type', hasLabel: false },
  'inspection-adjustments': { model: ServiceInspectionAdjustment, name: 'Inspection Adjustment', hasLabel: false },
  'package-levels': { model: ServicePackageLevel, name: 'Package Level', hasLabel: false },
  'addon-types': { model: ServiceAddonType, name: 'Addon Type', hasLabel: false },
  'material-policies': { model: ServiceMaterialPolicy, name: 'Material Policy', hasLabel: false },
  'charge-types': { model: ServiceChargeType, name: 'Charge Type', hasLabel: false },
  'warranty-options': { model: ServiceWarrantyOption, name: 'Warranty Option', hasLabel: false },
  'execution-methods': { model: ServiceExecutionMethod, name: 'Execution Method', hasLabel: false },
  'area-types': { model: ServiceAreaType, name: 'Service Area Type', hasLabel: false },
  'radius-options': { model: ServiceRadiusOption, name: 'Radius Option', hasLabel: true },
  'slot-durations': { model: ServiceSlotDuration, name: 'Slot Duration', hasLabel: true },
  'booking-capacities': { model: ServiceBookingCapacity, name: 'Booking Capacity', hasLabel: true },
};
