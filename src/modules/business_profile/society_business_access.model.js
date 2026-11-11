import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

export const SOCIETY_BUSINESS_ACCESS_STATUS = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED',
};

const SocietyBusinessAccess = sequelize.define(
  'SocietyBusinessAccess',
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
    society_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    requested_by: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    requested_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    reviewed_by: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'REVOKED'),
      allowNull: false,
      defaultValue: 'REQUESTED',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rejection_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ...commonFields,
  },
  {
    tableName: 'society_business_accesses',
    timestamps: false,
    indexes: [
      { fields: ['business_id'] },
      { fields: ['society_id'] },
      { fields: ['status'] },
      { unique: true, fields: ['business_id', 'society_id'] },
    ],
  }
);

export default SocietyBusinessAccess;
