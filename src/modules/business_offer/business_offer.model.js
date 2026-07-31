import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

const BusinessOffer = sequelize.define('BusinessOffer', {
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
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  discount: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  valid_from: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  valid_to: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  image: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'business_offers',
});

// Setup relationships
BusinessOffer.belongsTo(BusinessProfile, { foreignKey: 'business_id', as: 'business' });
BusinessProfile.hasMany(BusinessOffer, { foreignKey: 'business_id', as: 'offers' });

export default BusinessOffer;
