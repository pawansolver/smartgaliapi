import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';

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
  title: {
    type: DataTypes.STRING,
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
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_available: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'service_listings',
});

// Setup relationships
ServiceListing.belongsTo(ServiceProviderProfile, { foreignKey: 'provider_id', as: 'provider' });

export default ServiceListing;
