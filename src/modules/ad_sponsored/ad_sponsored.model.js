import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import Post from '../post/post.model.js';

const AdSponsoredPost = sequelize.define('AdSponsoredPost', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  post_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: Post,
      key: 'id'
    }
  },
  sponsor_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  amount_paid: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'paused'),
    defaultValue: 'active',
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  end_date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'ad_sponsored_posts',
});

// Setup relationships
AdSponsoredPost.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });

export default AdSponsoredPost;
