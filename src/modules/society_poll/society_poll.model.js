import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

export const POLL_STATUS = Object.freeze({
  ACTIVE: 'active',
  CLOSED: 'closed',
});

const SocietyPoll = sequelize.define('SocietyPoll', {
  pollId: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  id: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('pollId');
    },
    set(val) {
      this.setDataValue('pollId', val);
    },
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyProfile,
      key: 'id',
    },
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  question: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  options: {
    type: DataTypes.TEXT, // JSON array string of option strings
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'closed'),
    defaultValue: 'active',
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'society_polls',
});

SocietyPoll.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyProfile.hasMany(SocietyPoll, { foreignKey: 'society_id', as: 'polls' });

SocietyPoll.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
User.hasMany(SocietyPoll, { foreignKey: 'created_by', as: 'society_polls' });

export default SocietyPoll;
