import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import Post from '../post/post.model.js';

const PostComment = sequelize.define('PostComment', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  post_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: Post,
      key: 'id',
    }
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  parent_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    // self-referencing
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
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
    defaultValue: DataTypes.NOW,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'post_comments',
});

// Setup relationships
PostComment.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
PostComment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
PostComment.belongsTo(PostComment, { foreignKey: 'parent_id', as: 'parentComment' });
PostComment.hasMany(PostComment, { foreignKey: 'parent_id', as: 'replies' });

export default PostComment;
