import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Community from '../community/community.model.js';
import EventCategory from '../event_category/event_category.model.js';

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
    { name: 'ix_events_lat_lng', fields: ['latitude', 'longitude'] },
    { name: 'ix_events_category_start', fields: ['category_id', 'start_at'] },
  ]
});

// Setup relationships
Event.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Event.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
Event.belongsTo(EventCategory, { foreignKey: 'category_id', as: 'category' });

export default Event;
