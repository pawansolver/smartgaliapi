import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import Community from '../community/community.model.js';
import User from '../user/user.model.js';

const CommunityDocument = sequelize.define('CommunityDocument', {
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
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  file_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  file_type: {
    type: DataTypes.STRING(50),
    defaultValue: 'pdf',
  },
  file_size: {
    type: DataTypes.STRING(50),
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
  tableName: 'community_documents',
  indexes: [
    { fields: ['community_id', 'created_at'] },
  ],
});

CommunityDocument.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
Community.hasMany(CommunityDocument, { foreignKey: 'community_id' });

CommunityDocument.belongsTo(User, { foreignKey: 'created_by', as: 'uploader' });

export default CommunityDocument;
