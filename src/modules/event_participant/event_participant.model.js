import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Event from '../event/event.model.js';

export const RSVP_STATUS = {
  GOING: 'going',
  INTERESTED: 'interested',
  INVITED: 'invited',
  DECLINED: 'declined',
};

const EventParticipant = sequelize.define('EventParticipant', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  event_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: Event,
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
  status: {
    type: DataTypes.ENUM('going', 'interested', 'invited', 'declined'),
    defaultValue: 'going',
    allowNull: false,
  },
  joined_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'event_participants',
  indexes: [
    { name: 'uq_ep_event_user', unique: true, fields: ['event_id', 'user_id'] },
    { name: 'ix_ep_event_status_del', fields: ['event_id', 'status', 'is_deleted'] },
    { name: 'ix_ep_user_status_del', fields: ['user_id', 'status', 'is_deleted'] },
  ]
});

// Setup relationships
EventParticipant.belongsTo(Event, { foreignKey: 'event_id', as: 'event' });
EventParticipant.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Event.hasMany(EventParticipant, { foreignKey: 'event_id', as: 'participants' });

export default EventParticipant;
