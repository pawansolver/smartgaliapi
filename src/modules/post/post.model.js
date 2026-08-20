import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';

// Post model aligned with actual DB columns:
// ["id","user_id","content","media_url","latitude","longitude","likes_count","comments_count","is_active","is_deleted","created_at"]
const Post = sequelize.define('Post', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: User, key: 'userId' },
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  type: {
    type: DataTypes.ENUM('text', 'image', 'video', 'poll', 'event', 'mixed'),
    allowNull: false,
    defaultValue: 'text',
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private', 'friends', 'community', 'followers'),
    allowNull: false,
    defaultValue: 'public',
  },
  media_url: {
    type: DataTypes.STRING,
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
  likes_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  comments_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  shares_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  created_at: {
    type: DataTypes.DATE,
    field: 'created_at',
  },
}, {
  timestamps: false,
  tableName: 'posts',
});

// Relationships
Post.belongsTo(User, { foreignKey: 'user_id', as: 'author' });

export default Post;
