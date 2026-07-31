import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import UserProfile from '../userProfile/userProfile.model.js';

/**
 * Post Model — User-generated social feed timeline (Amit, Neha's posts in UI)
 * Wraps around existing 'posts' DB table — only uses fields required by UI.
 * UI Fields: content, mediaUrl (image), likesCount, commentsCount, location
 */
const FeedPost = sequelize.define('FeedPost', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  // FK → users.userId (the author)
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: User, key: 'userId' },
  },
  // Text content of the post (UI: "Does anyone know a reliable car washer...")
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Image URL (UI: Neha's dog image card) — null for text-only posts
  media_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // Geo-coordinates of where the post was created (for hyperlocal filtering)
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  // Counters — updated atomically on like/comment actions
  likes_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  comments_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  // Common soft-delete/audit fields
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
    defaultValue: DataTypes.NOW,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'posts',   // ← reuse existing 'posts' table
});

// Associations
FeedPost.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
FeedPost.belongsTo(UserProfile, { foreignKey: 'user_id', targetKey: 'user_id', foreignKeyConstraint: false, as: 'authorProfile' });
User.hasMany(FeedPost, { foreignKey: 'user_id', as: 'posts' });

export default FeedPost;
