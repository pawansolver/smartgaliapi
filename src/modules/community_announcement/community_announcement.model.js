import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import Community from '../community/community.model.js';
import User from '../user/user.model.js';

const CommunityAnnouncement = sequelize.define('CommunityAnnouncement', {
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
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  is_pinned: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  ...commonFields,
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    }
  }
}, {
  timestamps: false,
  tableName: 'community_announcements',
  indexes: [
    { fields: ['community_id', 'is_pinned', 'created_at'] },
  ],
});

CommunityAnnouncement.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
Community.hasMany(CommunityAnnouncement, { foreignKey: 'community_id' });

CommunityAnnouncement.belongsTo(User, { foreignKey: 'created_by', as: 'author' });

export default CommunityAnnouncement;
