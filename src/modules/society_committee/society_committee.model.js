import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const SocietyCommittee = sequelize.define('SocietyCommittee', {
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
  name: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  scope_type: {
    type: DataTypes.ENUM('entire_society', 'specific_gates', 'specific_area', 'gate', 'zone', 'block'),
    allowNull: false,
    defaultValue: 'entire_society',
  },
  scope_gate_ids: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  scope_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  committee_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'custom',
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'archived'),
    allowNull: false,
    defaultValue: 'active',
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: User, key: 'userId' },
  },
  updated_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: User, key: 'userId' },
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
  tableName: 'society_committees',
  timestamps: false,
});

export const SocietyCommitteeMember = sequelize.define('SocietyCommitteeMember', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  committee_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: SocietyCommittee, key: 'id' },
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
  designation: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Member',
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'active', 'inactive', 'suspended', 'revoked', 'rejected', 'expired'),
    allowNull: false,
    defaultValue: 'pending',
  },
  invited_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  invited_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  accepted_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  rejected_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  expires_at: {
    type: DataTypes.DATE,
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
  tableName: 'society_committee_members',
  timestamps: false,
});

export const SocietyCommitteePermission = sequelize.define('SocietyCommitteePermission', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  committee_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: SocietyCommittee, key: 'id' },
  },
  committee_member_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: SocietyCommitteeMember, key: 'id' },
  },
  permission_code: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'society_committee_permissions',
  timestamps: false,
});

// Associations
SocietyCommittee.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyCommittee.hasMany(SocietyCommitteeMember, { foreignKey: 'committee_id', as: 'members' });
SocietyCommittee.hasMany(SocietyCommitteePermission, { foreignKey: 'committee_id', as: 'permissions' });

SocietyCommitteeMember.belongsTo(SocietyCommittee, { foreignKey: 'committee_id', as: 'committee' });
SocietyCommitteeMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
SocietyCommitteeMember.hasMany(SocietyCommitteePermission, { foreignKey: 'committee_member_id', as: 'memberPermissions' });

export default {
  SocietyCommittee,
  SocietyCommitteeMember,
  SocietyCommitteePermission,
};
