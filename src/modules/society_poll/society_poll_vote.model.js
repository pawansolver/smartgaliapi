import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyPoll from './society_poll.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

const SocietyPollVote = sequelize.define('SocietyPollVote', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  poll_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyPoll,
      key: 'pollId',
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
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  option_index: {
    type: DataTypes.INTEGER,
    allowNull: false,
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
  tableName: 'society_poll_votes',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['poll_id', 'user_id'] },
    { fields: ['poll_id', 'option_index'] },
    { fields: ['society_id', 'user_id'] },
  ],
});

SocietyPollVote.belongsTo(SocietyPoll, { foreignKey: 'poll_id', as: 'poll' });
SocietyPoll.hasMany(SocietyPollVote, { foreignKey: 'poll_id', as: 'votes' });

SocietyPollVote.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyPollVote.belongsTo(User, { foreignKey: 'user_id', as: 'voter' });

export default SocietyPollVote;
