import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Community from '../community/community.model.js';

const Post = sequelize.define('Post', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  community_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: Community,
      key: 'communityId',
    }
  },
  type: {
    type: DataTypes.ENUM('text', 'image', 'video', 'poll', 'event'),
    defaultValue: 'text',
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  media_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  location: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private', 'friends', 'community'),
    defaultValue: 'public',
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'posts',
});

// Setup relationships
Post.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
Post.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });

export default Post;
