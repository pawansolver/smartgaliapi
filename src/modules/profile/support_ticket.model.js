import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

const SupportTicket = sequelize.define('SupportTicket', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: User, key: 'userId' },
  },
  category: {
    type: DataTypes.STRING(80),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('open', 'in_progress', 'resolved', 'closed'),
    allowNull: false,
    defaultValue: 'open',
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'support_tickets',
  indexes: [{ fields: ['user_id', 'status'] }],
});

SupportTicket.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(SupportTicket, { foreignKey: 'user_id', as: 'supportTickets' });

export default SupportTicket;
