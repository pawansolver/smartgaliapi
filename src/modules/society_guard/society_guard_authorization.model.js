import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const SocietyGuardAuthorization = sequelize.define('SocietyGuardAuthorization', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: SocietyProfile, key: 'id' },
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: User, key: 'userId' },
  },
  profile_photo_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  alternate_phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  gender: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  dob: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  badge_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  id_document_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  designation: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Security Guard',
  },
  guard_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'society_guard',
  },
  employee_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  agency_name: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  id_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'aadhaar',
  },
  id_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  verification_status: {
    type: DataTypes.ENUM('unverified', 'pending', 'verified', 'rejected'),
    allowNull: false,
    defaultValue: 'unverified',
  },
  police_verification_status: {
    type: DataTypes.ENUM('not_submitted', 'pending', 'in_progress', 'verified'),
    allowNull: false,
    defaultValue: 'not_submitted',
  },
  verification_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  verified_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  joining_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  contract_start_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  contract_end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended', 'revoked', 'expired'),
    allowNull: false,
    defaultValue: 'active',
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  updated_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'society_guard_authorizations',
  timestamps: false,
});

SocietyGuardAuthorization.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyGuardAuthorization.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default SocietyGuardAuthorization;
