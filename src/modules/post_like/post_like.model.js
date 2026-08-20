import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import Post from '../post/post.model.js';

const PostLike = sequelize.define('PostLike', {
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
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'post_likes',
});

// Setup relationships
PostLike.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
PostLike.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default PostLike;
