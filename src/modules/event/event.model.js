import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Community from '../community/community.model.js';
import EventCategory from '../event_category/event_category.model.js';

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
    type: DataTypes.STRING,
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
  },
  cover_image: {
    type: DataTypes.STRING,
    allowNull: true,
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
});

// Setup relationships
Event.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Event.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
Event.belongsTo(EventCategory, { foreignKey: 'category_id', as: 'category' });

export default Event;
