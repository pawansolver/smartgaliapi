import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Post from '../post/post.model.js';

const PostShare = sequelize.define('PostShare', {
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
  ...commonFields
}, {
  timestamps: false,
  tableName: 'post_shares',
});

// Setup relationships
PostShare.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });
PostShare.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default PostShare;
