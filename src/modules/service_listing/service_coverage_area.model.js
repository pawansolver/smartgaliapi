import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import { ServiceRadiusOption } from '../service_config/service_config.models.js';
import { City, Locality, Pincode } from '../location_master/location_master.models.js';
import SocietyProfile from '../society_profile/society_profile.model.js';

/**
 * ServiceCoverageArea
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative Multi-Coverage Area model.
 * A single Service Listing can offer multiple distinct coverage perimeters
 * (e.g., Kankarbagh 10 KM + Rajendra Nagar 5 KM).
 * 
 * Strict separation of:
 * - Coverage Scope: PUBLIC, SOCIETY, SOCIETY_AND_PUBLIC
 * - Coverage Method: RADIUS, LOCALITY, PINCODE, CITY, SOCIETY
 * - Explicit Service Coverage Origin: origin_latitude & origin_longitude
 *   (Separate from provider's private home/GPS and separate from locality centroid)
 * - Resolved Radius KM from Admin-controlled ServiceRadiusOption master
 * ─────────────────────────────────────────────────────────────────────────────
 */
const ServiceCoverageArea = sequelize.define('ServiceCoverageArea', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  service_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'service_listings',
      key: 'id',
    },
  },
  coverage_scope: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'PUBLIC', // 'PUBLIC', 'SOCIETY', 'SOCIETY_AND_PUBLIC'
  },
  coverage_method: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'RADIUS', // 'RADIUS', 'LOCALITY', 'PINCODE', 'CITY', 'SOCIETY'
  },
  city_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: City,
      key: 'id',
    },
  },
  locality_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: Locality,
      key: 'id',
    },
  },
  pincode_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: Pincode,
      key: 'id',
    },
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: SocietyProfile,
      key: 'id',
    },
  },
  origin_latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  origin_longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  origin_address: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  radius_option_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ServiceRadiusOption,
      key: 'id',
    },
  },
  resolved_radius_km: {
    type: DataTypes.DECIMAL(6, 2),
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  display_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'service_coverage_areas',
});

// Setup master relations (ServiceListing relation is established in service_listing.model.js)
ServiceCoverageArea.belongsTo(ServiceRadiusOption, { foreignKey: 'radius_option_id', as: 'radius_option' });
ServiceCoverageArea.belongsTo(City, { foreignKey: 'city_id', as: 'city' });
ServiceCoverageArea.belongsTo(Locality, { foreignKey: 'locality_id', as: 'locality' });
ServiceCoverageArea.belongsTo(Pincode, { foreignKey: 'pincode_id', as: 'pincode' });
ServiceCoverageArea.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });

export default ServiceCoverageArea;
