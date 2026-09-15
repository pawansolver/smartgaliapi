import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import Event from '../event/event.model.js';
import User from '../user/user.model.js';

export const INVITATION_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
});

const EventInvitation = sequelize.define('EventInvitation', {
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
    },
  },
  inviter_user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  invitee_user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'declined', 'cancelled'),
    defaultValue: 'pending',
    allowNull: false,
  },
  response_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'event_invitations',
});

EventInvitation.belongsTo(Event, { foreignKey: 'event_id', as: 'event' });
EventInvitation.belongsTo(User, { foreignKey: 'inviter_user_id', as: 'inviter' });
EventInvitation.belongsTo(User, { foreignKey: 'invitee_user_id', as: 'invitee' });

export default EventInvitation;
