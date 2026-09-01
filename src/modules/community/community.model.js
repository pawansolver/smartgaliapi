import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import CommunityCategory from '../communityCategory/communityCategory.model.js';
import User from '../user/user.model.js';

const Community = sequelize.define('Community', {
  communityId: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
    field: 'communityId',
  },
  communityName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'communityName',
  },
  communityDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'communityDescription',
  },
  category_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: CommunityCategory,
      key: 'communityCategoryId',
    }
  },
  cover_image: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  icon: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  is_private: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  rules: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  members_count: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  posts_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  // Geo discovery fields (Phase 6)
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  location_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  discovery_radius: {
    type: DataTypes.DECIMAL(6, 2),
    defaultValue: 25.00, // default 25km radius
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'pending', 'blocked'),
    defaultValue: 'active',
  },
  ...commonFields,
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  }
}, {
  timestamps: false,
  tableName: 'communities',
  indexes: [
    { fields: ['status', 'is_deleted', 'category_id'] },
    { fields: ['category_id'] },
    { fields: ['created_by'] },
    { fields: ['latitude', 'longitude'] },
  ],
});

Community.belongsTo(CommunityCategory, { foreignKey: 'category_id', as: 'category' });
CommunityCategory.hasMany(Community, { foreignKey: 'category_id' });

Community.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
User.hasMany(Community, { foreignKey: 'created_by' });

export default Community;
