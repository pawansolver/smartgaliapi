import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

const BusinessImage = sequelize.define('BusinessImage', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  business_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: BusinessProfile,
      key: 'id',
    }
  },
  image_url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'business_images',
});

// Setup relationships
BusinessImage.belongsTo(BusinessProfile, { foreignKey: 'business_id', as: 'business' });
BusinessProfile.hasMany(BusinessImage, { foreignKey: 'business_id', as: 'images' });

export default BusinessImage;
