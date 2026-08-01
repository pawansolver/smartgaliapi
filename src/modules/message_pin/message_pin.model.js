import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import Chat from '../chat/chat.model.js';
import Message from '../message/message.model.js';
import User from '../user/user.model.js';

const MessagePin = sequelize.define('MessagePin', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  chat_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: Chat, key: 'id' },
  },
  message_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: Message, key: 'id' },
  },
  pinned_by: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: User, key: 'userId' },
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName: 'message_pins',
  indexes: [
    { fields: ['chat_id', 'created_at'] },
    {
      unique: true,
      fields: ['chat_id', 'message_id'],
      name: 'uq_message_pin_chat_message',
    },
  ],
});

MessagePin.belongsTo(Chat, { foreignKey: 'chat_id', as: 'chat' });
MessagePin.belongsTo(Message, { foreignKey: 'message_id', as: 'message' });
MessagePin.belongsTo(User, { foreignKey: 'pinned_by', as: 'pinnedBy' });
Message.hasOne(MessagePin, { foreignKey: 'message_id', as: 'pin' });

export default MessagePin;
