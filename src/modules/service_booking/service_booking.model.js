import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import ServiceBookingTimeline from './service_booking_timeline.model.js';
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
  booking_reference: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  scheduled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  time_slot: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  service_address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  cancellation_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  proposed_reschedule_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  proposed_reschedule_slot: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  proposed_reschedule_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'pending',
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  doorstep_pin: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  doorstep_pin_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  price_snapshot: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('price_snapshot');
      if (!raw) return null;
      try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (_) {
        return null;
      }
    },
    set(val) {
      this.setDataValue('price_snapshot', val && typeof val === 'object' ? JSON.stringify(val) : val);
    }
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'service_bookings',
});

// Setup relationships
ServiceBooking.belongsTo(ServiceListing, { foreignKey: 'listing_id', as: 'listing' });
ServiceBooking.belongsTo(ServiceProviderProfile, { foreignKey: 'provider_id', as: 'provider' });
ServiceBooking.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
ServiceBooking.hasMany(ServiceBookingTimeline, { foreignKey: 'booking_id', as: 'timelines' });
ServiceBookingTimeline.belongsTo(ServiceBooking, { foreignKey: 'booking_id', as: 'booking' });

export default ServiceBooking;
