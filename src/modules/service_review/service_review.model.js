import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ServiceBooking from '../service_booking/service_booking.model.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import User from '../user/user.model.js';

const ServiceReview = sequelize.define('ServiceReview', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  booking_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ServiceBooking,
      key: 'id',
    }
  },
  listing_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ServiceListing,
      key: 'id',
    }
  },
  provider_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ServiceProviderProfile,
      key: 'id',
    }
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'service_reviews',
});

// Setup relationships
ServiceReview.belongsTo(ServiceBooking, { foreignKey: 'booking_id', as: 'booking' });
ServiceReview.belongsTo(ServiceListing, { foreignKey: 'listing_id', as: 'listing' });
ServiceReview.belongsTo(ServiceProviderProfile, { foreignKey: 'provider_id', as: 'provider' });
ServiceReview.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default ServiceReview;
