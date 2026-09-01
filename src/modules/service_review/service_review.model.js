import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ServiceBooking from '../service_booking/service_booking.model.js';
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
ServiceReview.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default ServiceReview;
