import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import Community from '../community/community.model.js';
import User from '../user/user.model.js';

const CommunityMember = sequelize.define('CommunityMember', {
  communityMemberId: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  community_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: Community,
      key: 'communityId',
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
  role: {
    type: DataTypes.ENUM('admin', 'moderator', 'member'),
    defaultValue: 'member',
  },
  joined_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  status: {
    type: DataTypes.ENUM('active', 'banned', 'left', 'pending'),
    defaultValue: 'active',
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'community_members',
});

// Setup relationships
CommunityMember.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
Community.hasMany(CommunityMember, { foreignKey: 'community_id' });

CommunityMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(CommunityMember, { foreignKey: 'user_id' });

export default CommunityMember;
