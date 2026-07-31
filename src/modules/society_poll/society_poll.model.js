import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

const SocietyPoll = sequelize.define('SocietyPoll', {
  pollId: {
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
    type: DataTypes.TEXT, // Store JSON stringified array of options
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
  ...commonFields
}, {
  timestamps: false,
  tableName: 'society_polls',
});

// Setup relationships
SocietyPoll.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyProfile.hasMany(SocietyPoll, { foreignKey: 'society_id' });

SocietyPoll.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
User.hasMany(SocietyPoll, { foreignKey: 'created_by' });

export default SocietyPoll;
