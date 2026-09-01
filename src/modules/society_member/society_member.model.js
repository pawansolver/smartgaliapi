import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const SOCIETY_MEMBER_ROLE = Object.freeze({
  ADMIN: 'admin',
  COMMITTEE: 'committee',
  MEMBER: 'member',
  TENANT: 'tenant',
});

export const SOCIETY_MEMBER_STATUS = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  REJECTED: 'rejected',
});

const SocietyMember = sequelize.define('SocietyMember', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyProfile,
      key: 'id',
    },
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  flat_no: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  role: {
    type: DataTypes.ENUM('admin', 'member', 'tenant', 'committee'),
    defaultValue: 'member',
  },
  joined_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'pending', 'rejected'),
    defaultValue: 'pending',
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'society_members',
});

SocietyMember.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyProfile.hasMany(SocietyMember, { foreignKey: 'society_id', as: 'members' });

SocietyMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(SocietyMember, { foreignKey: 'user_id', as: 'society_memberships' });

export default SocietyMember;
