import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import SocietyProfile from '../society_profile/society_profile.model.js';

const SocietyFacility = sequelize.define('SocietyFacility', {
  id: {
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
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  operating_hours: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  booking_rules: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  max_capacity: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  ...commonFields,
}, {
  timestamps: false,
  tableName: 'society_facilities',
});

SocietyFacility.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyProfile.hasMany(SocietyFacility, { foreignKey: 'society_id', as: 'facilities' });

export default SocietyFacility;
