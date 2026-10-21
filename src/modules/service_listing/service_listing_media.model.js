import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ServiceListing from './service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';

export const SERVICE_MEDIA_STATUS = Object.freeze({
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
});

const ServiceListingMedia = sequelize.define('ServiceListingMedia', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  service_listing_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: ServiceListing,
      key: 'id',
    },
  },
  provider_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: ServiceProviderProfile,
      key: 'id',
    },
  },
  media_url: {
    type: DataTypes.STRING(1000),
    allowNull: false,
  },
  media_type: {
    type: DataTypes.STRING(50),
    defaultValue: 'image',
    allowNull: false,
  },
  file_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  mime_type: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  display_order: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
  is_primary: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'active',
    allowNull: false,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'service_listing_media',
  indexes: [
    {
      name: 'idx_slm_listing_status',
      fields: ['service_listing_id', 'status', 'is_deleted'],
    },
    {
      name: 'idx_slm_provider_listing',
      fields: ['provider_id', 'service_listing_id'],
    },
    {
      name: 'idx_slm_display_order',
      fields: ['service_listing_id', 'display_order'],
    },
  ],
});

// Setup relationships
ServiceListingMedia.belongsTo(ServiceListing, { foreignKey: 'service_listing_id', as: 'listing' });
ServiceListingMedia.belongsTo(ServiceProviderProfile, { foreignKey: 'provider_id', as: 'provider' });

ServiceListing.hasMany(ServiceListingMedia, {
  foreignKey: 'service_listing_id',
  as: 'media_items',
});

export default ServiceListingMedia;
