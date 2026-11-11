import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

const BusinessSearchSynonym = sequelize.define(
  'BusinessSearchSynonym',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    canonical_key: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    category_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    term: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    language: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'hi_latn', // 'en', 'hi_latn', 'brand', 'slang'
    },
    weight: {
      type: DataTypes.DECIMAL(4, 2),
      allowNull: false,
      defaultValue: 1.0,
    },
    is_umbrella: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ...commonFields,
  },
  {
    timestamps: false,
    tableName: 'business_search_synonyms',
    indexes: [
      {
        name: 'uq_bss_canonical_term',
        unique: true,
        fields: ['canonical_key', 'term'],
      },
      {
        name: 'idx_bss_term_active',
        fields: ['term', 'is_active', 'is_deleted'],
      },
      {
        name: 'idx_bss_canonical_active',
        fields: ['canonical_key', 'is_active', 'is_deleted'],
      },
    ],
  }
);

export default BusinessSearchSynonym;

