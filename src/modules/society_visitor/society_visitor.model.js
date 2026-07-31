import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

const SocietyVisitor = sequelize.define('SocietyVisitor', {
  visitorId: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
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
  visitor_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  visitor_phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  purpose: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  vehicle_no: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  check_in_time: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  check_out_time: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('expected', 'checked_in', 'checked_out', 'denied'),
    defaultValue: 'expected',
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'society_visitors',
});

// Setup relationships
SocietyVisitor.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyProfile.hasMany(SocietyVisitor, { foreignKey: 'society_id' });

SocietyVisitor.belongsTo(User, { foreignKey: 'user_id', as: 'resident' });
User.hasMany(SocietyVisitor, { foreignKey: 'user_id' });

export default SocietyVisitor;
