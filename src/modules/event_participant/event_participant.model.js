import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Event from '../event/event.model.js';

const EventParticipant = sequelize.define('EventParticipant', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  event_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: Event,
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
  status: {
    type: DataTypes.ENUM('going', 'interested', 'invited', 'declined'),
    defaultValue: 'going',
  },
  joined_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'event_participants',
});

// Setup relationships
EventParticipant.belongsTo(Event, { foreignKey: 'event_id', as: 'event' });
EventParticipant.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default EventParticipant;
