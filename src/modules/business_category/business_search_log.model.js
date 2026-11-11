import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const BusinessSearchLog = sequelize.define(
  'BusinessSearchLog',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    query: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    normalized_query: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    category_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    category_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    result_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    product_result_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    business_result_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    is_zero_result: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    matched_via_typo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    did_you_mean: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    latency_ms: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    city_name: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    locality_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    society_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    source: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'resident_search',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: false,
    tableName: 'business_search_logs',
    indexes: [
      {
        name: 'idx_bsl_zero_created',
        fields: ['is_zero_result', 'created_at'],
      },
      {
        name: 'idx_bsl_norm_query_created',
        fields: ['normalized_query', 'created_at'],
      },
      {
        name: 'idx_bsl_city_created',
        fields: ['city_name', 'created_at'],
      },
    ],
  }
);

export default BusinessSearchLog;

