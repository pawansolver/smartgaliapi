import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

const SocietyProfile = sequelize.define('SocietyProfile', {
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
  society_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  registration_no: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  address: {
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
  total_flats: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'society_profiles',
});

// Setup relationships
SocietyProfile.belongsTo(User, { foreignKey: 'user_id', as: 'admin_user' });

export default SocietyProfile;
