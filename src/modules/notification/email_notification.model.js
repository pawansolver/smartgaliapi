import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

const EmailNotification = sequelize.define('EmailNotification', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('sent', 'failed', 'pending'),
    defaultValue: 'sent',
  },
  ...commonFields,
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  }
}, {
  timestamps: false,
  tableName: 'email_notifications',
});

// Setup relationships
EmailNotification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default EmailNotification;
