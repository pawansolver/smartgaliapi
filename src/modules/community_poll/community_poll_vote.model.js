import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import CommunityPoll from './community_poll.model.js';
import User from '../user/user.model.js';

const CommunityPollVote = sequelize.define('CommunityPollVote', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  poll_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: CommunityPoll,
      key: 'id',
    }
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    }
  },
  option_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  }
}, {
  timestamps: false,
  tableName: 'community_poll_votes',
  indexes: [
    { unique: true, fields: ['poll_id', 'user_id'] },
    { fields: ['poll_id', 'option_id'] },
  ],
});

CommunityPollVote.belongsTo(CommunityPoll, { foreignKey: 'poll_id', as: 'poll' });
CommunityPoll.hasMany(CommunityPollVote, { foreignKey: 'poll_id', as: 'votes' });

CommunityPollVote.belongsTo(User, { foreignKey: 'user_id', as: 'voter' });

export default CommunityPollVote;
