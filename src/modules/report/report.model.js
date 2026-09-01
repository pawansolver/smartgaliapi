import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

const Report = sequelize.define('Report', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  reporter_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  reported_type: {
    type: DataTypes.ENUM('user', 'post', 'comment', 'event', 'business'),
    allowNull: false,
  },
  reported_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'reviewed', 'resolved', 'dismissed'),
    defaultValue: 'pending',
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'reports',
});

// Setup relationships
Report.belongsTo(User, { foreignKey: 'reporter_id', as: 'reporter' });

export default Report;
