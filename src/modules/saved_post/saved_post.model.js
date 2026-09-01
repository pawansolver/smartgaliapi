import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Post from '../post/post.model.js';

const SavedPost = sequelize.define('SavedPost', {
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
  post_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: Post,
      key: 'id',
    }
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'saved_posts',
});

// Setup relationships
SavedPost.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
SavedPost.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });

export default SavedPost;
