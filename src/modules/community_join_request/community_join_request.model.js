import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import Community from '../community/community.model.js';
import User from '../user/user.model.js';

const CommunityJoinRequest = sequelize.define('CommunityJoinRequest', {
  id: {
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
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
    allowNull: false,
  },
  reviewed_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  reviewed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  pending_key: {
    type: DataTypes.TINYINT,
    allowNull: true,
    defaultValue: 1,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'community_join_requests',
  indexes: [
    { fields: ['community_id', 'status'] },
    { fields: ['user_id', 'community_id'] },
    { unique: true, fields: ['community_id', 'user_id', 'pending_key'] },
  ],
});

CommunityJoinRequest.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
Community.hasMany(CommunityJoinRequest, { foreignKey: 'community_id' });

CommunityJoinRequest.belongsTo(User, { foreignKey: 'user_id', as: 'applicant' });
CommunityJoinRequest.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });

export default CommunityJoinRequest;
