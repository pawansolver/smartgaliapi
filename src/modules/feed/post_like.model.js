import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import FeedPost from './feed_post.model.js';

/**
 * PostLike Model — tracks unique likes per user per post
 * Reuses existing 'post_likes' table.
 * Composite unique index [user_id, post_id] prevents duplicate likes.
 */
const PostLike = sequelize.define('PostLike', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  post_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: FeedPost, key: 'id' },
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: User, key: 'userId' },
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'post_likes',   // ← reuse existing table
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'post_id'],  // prevents duplicate likes
    },
  ],
});

// Associations
PostLike.belongsTo(FeedPost, { foreignKey: 'post_id', as: 'post' });
PostLike.belongsTo(User, { foreignKey: 'user_id', as: 'liker' });
FeedPost.hasMany(PostLike, { foreignKey: 'post_id', as: 'likes' });

export default PostLike;
