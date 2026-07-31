import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

const CommunityCategory = sequelize.define('CommunityCategory', {
  communityCategoryId: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  communityCategoryName: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  communityCategoryIcon: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'community_categories',
});

export default CommunityCategory;
