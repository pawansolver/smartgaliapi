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
    allowNull: true,
    references: {
      model: SocietyProfile,
      key: 'id',
    }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'society_facilities',
});

// Setup relationships
SocietyFacility.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });

export default SocietyFacility;
