import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Community from '../community/community.model.js';
import EventCategory from '../event_category/event_category.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';

export const EVENT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
};

export const EVENT_VISIBILITY = {
  PUBLIC: 'public',
  COMMUNITY: 'community',
  PRIVATE: 'private',
};

export const EVENT_TYPE = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  HYBRID: 'hybrid',
};

const Event = sequelize.define('Event', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: SocietyProfile,
      key: 'id',
    }
  },
  community_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: Community,
      key: 'communityId',
    }
  },
  category_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: EventCategory,
      key: 'id',
    }
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  location: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  location_name: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  start_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  end_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  event_type: {
    type: DataTypes.ENUM('online', 'offline', 'hybrid'),
    defaultValue: 'offline',
    allowNull: false,
  },
  visibility: {
    type: DataTypes.ENUM('public', 'community', 'private'),
    defaultValue: 'public',
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('draft', 'published', 'cancelled', 'completed'),
    defaultValue: 'published',
    allowNull: false,
  },
  cover_image: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  max_participants: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
  },
  going_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  interested_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  declined_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  speaker_or_host: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  is_registration_required: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  sub_events: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('sub_events');
      if (typeof rawValue === 'string') {
        try {
          return JSON.parse(rawValue);
        } catch (_) {
          return [];
        }
      }
      return rawValue || [];
    },
    set(val) {
      if (typeof val === 'string') {
        try {
          this.setDataValue('sub_events', JSON.parse(val));
        } catch (_) {
          this.setDataValue('sub_events', val);
        }
      } else {
        this.setDataValue('sub_events', val);
      }
    }
  },
  ...commonFields,
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  }
}, {
  timestamps: false,
  tableName: 'events',
  indexes: [
    { name: 'ix_events_start_at', fields: ['start_at'] },
    { name: 'ix_events_status_del_start', fields: ['status', 'is_deleted', 'start_at'] },
    { name: 'ix_events_comm_status_del', fields: ['community_id', 'status', 'is_deleted'] },
    { name: 'ix_events_society_status_del', fields: ['society_id', 'status', 'is_deleted'] },
    { name: 'ix_events_lat_lng', fields: ['latitude', 'longitude'] },
    { name: 'ix_events_category_start', fields: ['category_id', 'start_at'] },
  ]
});

// Setup relationships
Event.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Event.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
Event.belongsTo(EventCategory, { foreignKey: 'category_id', as: 'category' });
Event.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });

export default Event;
