import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

const AdCampaign = sequelize.define('AdCampaign', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  budget: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  spent_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  status: {
    type: DataTypes.ENUM('active', 'paused', 'completed'),
    defaultValue: 'active',
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  end_date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  views: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  clicks: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  target_audience: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'ad_campaigns',
});

export default AdCampaign;
