import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import User from '../user/user.model.js';

const ServiceBooking = sequelize.define('ServiceBooking', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  listing_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: ServiceListing,
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
  scheduled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'cancelled'),
    defaultValue: 'pending',
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'service_bookings',
});

// Setup relationships
ServiceBooking.belongsTo(ServiceListing, { foreignKey: 'listing_id', as: 'listing' });
ServiceBooking.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default ServiceBooking;
