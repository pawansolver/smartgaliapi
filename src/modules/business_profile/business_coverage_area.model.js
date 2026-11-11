import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

export const BUSINESS_COVERAGE_SCOPES = {
  PUBLIC: 'PUBLIC',
  SOCIETY: 'SOCIETY',
  SOCIETY_AND_PUBLIC: 'SOCIETY_AND_PUBLIC',
};

export const BUSINESS_COVERAGE_METHODS = {
  RADIUS: 'RADIUS',
  LOCALITY: 'LOCALITY',
  PINCODE: 'PINCODE',
  CITY: 'CITY',
  SOCIETY: 'SOCIETY',
};

const BusinessCoverageArea = sequelize.define(
  'BusinessCoverageArea',
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    business_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    coverage_scope: {
      type: DataTypes.ENUM('PUBLIC', 'SOCIETY', 'SOCIETY_AND_PUBLIC'),
      allowNull: false,
      defaultValue: 'PUBLIC',
    },
    coverage_method: {
      type: DataTypes.ENUM('RADIUS', 'LOCALITY', 'PINCODE', 'CITY', 'SOCIETY'),
      allowNull: false,
      defaultValue: 'RADIUS',
    },
    country_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    state_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    district_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    city_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    city_name: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    locality_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    locality_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    pincode_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    pincode: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    society_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    society_name: {
      type: DataTypes.STRING(200),
      allowNull: true,
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
    resolved_radius_km: {
      type: DataTypes.DECIMAL(6, 2),
      allowNull: true,
      defaultValue: 10.0,
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    ...commonFields,
  },
  {
    tableName: 'business_coverage_areas',
    timestamps: false,
    indexes: [
      { fields: ['business_id'] },
      { fields: ['coverage_scope', 'coverage_method'] },
      { fields: ['city_id'] },
      { fields: ['locality_id'] },
      { fields: ['pincode_id'] },
      { fields: ['society_id'] },
    ],
  }
);

export default BusinessCoverageArea;
