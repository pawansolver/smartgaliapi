import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import Community from '../community/community.model.js';
import User from '../user/user.model.js';

const CommunityMedia = sequelize.define('CommunityMedia', {
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
  media_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  media_type: {
    type: DataTypes.ENUM('image', 'video'),
    defaultValue: 'image',
  },
  caption: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  ...commonFields,
  uploaded_by: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'created_by',
    references: {
      model: User,
      key: 'userId',
    }
  }
}, {
  timestamps: false,
  tableName: 'community_media',
  indexes: [
    { fields: ['community_id', 'created_at'] },
  ],
});

CommunityMedia.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
Community.hasMany(CommunityMedia, { foreignKey: 'community_id' });

CommunityMedia.belongsTo(User, { foreignKey: 'created_by', as: 'uploader' });

export default CommunityMedia;
