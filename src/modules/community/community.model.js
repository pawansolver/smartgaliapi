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
  },
  communityName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  communityDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
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
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_private: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'pending'),
    defaultValue: 'active',
  },
  ...commonFields,
  // Overriding created_by from commonFields to be a BIGINT Foreign Key as requested
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
});

// Setup relationships
Community.belongsTo(CommunityCategory, { foreignKey: 'category_id', as: 'category' });
CommunityCategory.hasMany(Community, { foreignKey: 'category_id' });

Community.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
User.hasMany(Community, { foreignKey: 'created_by' });

export default Community;
