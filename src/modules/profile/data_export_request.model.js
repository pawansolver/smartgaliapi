import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

const DataExportRequest = sequelize.define('DataExportRequest', {
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
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending',
  },
  requested_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  export_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'data_export_requests',
  indexes: [{ fields: ['user_id', 'status'] }],
});

DataExportRequest.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(DataExportRequest, { foreignKey: 'user_id', as: 'dataExportRequests' });

export default DataExportRequest;
