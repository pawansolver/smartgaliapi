import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

const SocietyParking = sequelize.define('SocietyParking', {
  parkingId: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  id: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('parkingId');
    },
    set(val) {
      this.setDataValue('parkingId', val);
    },
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyProfile,
      key: 'id',
    },
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  parking_slot_no: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  vehicle_type: {
    type: DataTypes.ENUM('2_wheeler', '4_wheeler', 'other'),
    allowNull: false,
  },
  vehicle_no: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  vehicle_model: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_visitor_parking: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'society_parkings',
});

SocietyParking.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyProfile.hasMany(SocietyParking, { foreignKey: 'society_id', as: 'parkings' });

SocietyParking.belongsTo(User, { foreignKey: 'user_id', as: 'owner' });
User.hasMany(SocietyParking, { foreignKey: 'user_id', as: 'parkings' });

export default SocietyParking;
