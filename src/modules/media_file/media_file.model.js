import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

const MediaFile = sequelize.define('MediaFile', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('image', 'video', 'document', 'audio', 'other'),
    defaultValue: 'image',
  },
  uploaded_by: {
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
  tableName: 'media_files',
});

// Setup relationships
MediaFile.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });

export default MediaFile;
