import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import User from '../user/user.model.js';

const BusinessReview = sequelize.define('BusinessReview', {
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
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    }
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 5,
    }
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'business_reviews',
});

// Setup relationships
BusinessReview.belongsTo(BusinessProfile, { foreignKey: 'business_id', as: 'business' });
BusinessReview.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
BusinessProfile.hasMany(BusinessReview, { foreignKey: 'business_id', as: 'reviews' });
User.hasMany(BusinessReview, { foreignKey: 'user_id', as: 'business_reviews' });

export default BusinessReview;
